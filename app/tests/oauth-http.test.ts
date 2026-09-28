import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AppError } from "../src/errors.js";
import { createSessionToken } from "../src/auth/session.js";
import {
  setIdentityTokenVerifierForTests,
  type OAuthProvider,
} from "../src/auth/oauth-verify.js";
import { getPool } from "../src/db/pool.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const previousEnv: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (!(name in previousEnv)) previousEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnv(): void {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    delete previousEnv[name];
  }
}

describe("app oauth HTTP (FR-11)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    setIdentityTokenVerifierForTests(null);
    setEnv("APPLE_CLIENT_ID", "se.korpasset.app");
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
  });

  afterEach(() => {
    setIdentityTokenVerifierForTests(null);
    restoreEnv();
  });

  it("keeps the marketing homepage as waitlist, not product signup", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Bli betatestare/);
    assert.doesNotMatch(response.body, /Fortsätt med Apple/);
    await app.close();
  });

  it("creates a product account from a verified Apple identity token", async () => {
    setIdentityTokenVerifierForTests(async (provider: OAuthProvider, token: string) => {
      assert.equal(provider, "apple");
      assert.equal(token, "valid-apple");
      return { provider: "apple", subject: "apple.sub.1", name: "Ella" };
    });
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple", displayName: "Ella" },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { ok: boolean; redirectTo: string; created: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.equal(body.redirectTo, "/onboarding");
    const cookie = response.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(cookie?.value);

    const users = await getPool().query(
      `SELECT account_state, display_name FROM users`,
    );
    assert.equal(users.rowCount, 1);
    assert.equal(users.rows[0].account_state, "active");
    assert.equal(users.rows[0].display_name, "Ella");
    await app.close();
  });

  it("creates a new user from a Google subject that has never signed in", async () => {
    setIdentityTokenVerifierForTests(async (provider, token, nonce) => {
      assert.equal(provider, "google");
      assert.equal(token, "first-google-token");
      assert.equal(nonce, "client-nonce");
      return {
        provider: "google",
        subject: "google.sub.new",
        email: "new.user@example.com",
        name: "Nya",
      };
    });
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: {
        identityToken: "first-google-token",
        displayName: "Nya",
        nonce: "client-nonce",
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { ok: boolean; created: boolean; redirectTo: string };
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.equal(body.redirectTo, "/onboarding");
    assert.ok(response.cookies.find((item) => item.name === "bilklar_session")?.value);

    const users = await getPool().query(
      `SELECT id, account_state, display_name FROM users`,
    );
    assert.equal(users.rowCount, 1);
    assert.equal(users.rows[0].account_state, "active");
    assert.equal(users.rows[0].display_name, "Nya");
    const identities = await getPool().query(
      `SELECT provider, provider_subject, email FROM auth_identities WHERE user_id = $1`,
      [users.rows[0].id],
    );
    assert.equal(identities.rowCount, 1);
    assert.equal(identities.rows[0].provider, "google");
    assert.equal(identities.rows[0].provider_subject, "google.sub.new");
    assert.equal(identities.rows[0].email, "new.user@example.com");
    await app.close();
  });

  it("returns the same user on the second Google continue", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "google",
      subject: "google.sub.repeat",
    }));
    const app = await createTestApp();
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "t1" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "t2" },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    const count = await getPool().query(`SELECT count(*)::int AS n FROM users`);
    assert.equal(count.rows[0].n, 1);
    await app.close();
  });

  it("claims a guest session onto the same user_id", async () => {
    const guest = await createGuestUser("Pappa");
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.supervisor",
      name: "Pappa",
    }));
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(guest.id) },
      {
        method: "POST",
        url: "/api/auth/apple",
        headers: { "content-type": "application/json" },
        payload: { identityToken: "valid" },
      },
    );
    assert.equal(response.statusCode, 200);
    const body = response.json() as { claimedGuest: boolean; created: boolean };
    assert.equal(body.claimedGuest, true);
    assert.equal(body.created, false);

    const user = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [guest.id],
    );
    assert.equal(user.rows[0].account_state, "active");
    await app.close();
  });

  it("returns 409 when the identity already belongs to another user", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "google",
      subject: "google.taken",
    }));
    const app = await createTestApp();
    await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "first" },
    });
    const guest = await createGuestUser("Annan");
    const conflict = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(guest.id) },
      {
        method: "POST",
        url: "/api/auth/google",
        headers: { "content-type": "application/json" },
        payload: { identityToken: "second" },
      },
    );
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().code, "identity_on_other_user");
    assert.equal(conflict.json().stage, "account");
    await app.close();
  });

  it("rejects a missing token and an invalid token", async () => {
    setIdentityTokenVerifierForTests(async () => {
      throw new AppError("Ogiltig Google-inloggning", 401, "invalid_identity");
    });
    const app = await createTestApp();
    const missing = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(missing.statusCode, 400);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "nope" },
    });
    assert.equal(invalid.statusCode, 401);
    assert.equal(invalid.json().code, "invalid_identity");
    assert.equal(invalid.json().stage, "verify");
    await app.close();
  });

  it("returns 503 when the provider is not configured", async () => {
    setEnv("GOOGLE_CLIENT_ID", undefined);
    setEnv("GOOGLE_CLIENT_IDS", undefined);
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "x" },
    });
    assert.equal(response.statusCode, 503);
    await app.close();
  });

  it("mentions Apple and Google sub as identity key on the privacy policy", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    assert.equal(privacy.statusCode, 200);
    assert.match(privacy.body, /Sign in with Apple/);
    assert.match(privacy.body, /Sign in with Google/);
    assert.match(privacy.body, /sub/);
    await app.close();
  });

  it("creates a new Google user from the system browser and opens that session in the app", async () => {
    setIdentityTokenVerifierForTests(async (provider, token, nonce) => {
      assert.equal(provider, "google");
      assert.equal(token, "browser-id-token");
      assert.equal(nonce, "abc123nonce");
      return {
        provider: "google",
        subject: "google.sub.browser",
        email: "browser.user@example.com",
        name: "Browser",
      };
    });
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/auth/google/browser-handoff",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "browser-id-token", nonce: "abc123nonce" },
    });
    assert.equal(created.statusCode, 200);
    const body = created.json() as { ok: boolean; created: boolean; handoff: string };
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.match(body.handoff, /^[A-Za-z0-9_-]{20,128}$/);
    assert.equal(JSON.stringify(body).includes("browser-id-token"), false);
    assert.equal(JSON.stringify(body).includes("browser.user@example.com"), false);
    assert.equal(JSON.stringify(body).includes("google.sub.browser"), false);
    assert.equal(
      created.cookies.find((item) => item.name === "bilklar_session"),
      undefined,
    );

    const users = await getPool().query(
      `SELECT id, account_state, display_name FROM users`,
    );
    assert.equal(users.rowCount, 1);
    assert.equal(users.rows[0].account_state, "active");
    assert.equal(users.rows[0].display_name, "Browser");
    const identities = await getPool().query(
      `SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1`,
      [users.rows[0].id],
    );
    assert.equal(identities.rows[0].provider, "google");
    assert.equal(identities.rows[0].provider_subject, "google.sub.browser");

    const opened = await app.inject({
      method: "GET",
      url: `/app?oauth_handoff=${body.handoff}`,
    });
    assert.equal(opened.statusCode, 302);
    assert.equal(opened.headers.location, "/onboarding");
    assert.ok(opened.cookies.find((item) => item.name === "bilklar_session")?.value);
    assert.equal(String(opened.headers.location).includes(body.handoff), false);

    const again = await app.inject({
      method: "GET",
      url: `/app?oauth_handoff=${body.handoff}`,
    });
    assert.equal(again.statusCode, 302);
    assert.equal(again.headers.location, "/onboarding");

    await getPool().query(
      `UPDATE oauth_handoffs SET used_at = now() - interval '31 seconds' WHERE code = $1`,
      [body.handoff],
    );
    const stale = await app.inject({
      method: "GET",
      url: `/app?oauth_handoff=${body.handoff}`,
    });
    assert.equal(stale.statusCode, 200);
    assert.match(stale.body, /Inloggningen gick inte att slutföra/);
    assert.equal(stale.body.includes(body.handoff), false);
    assert.equal(
      stale.cookies.find((item) => item.name === "bilklar_session"),
      undefined,
    );
    await app.close();
  });

  it("does not report a rejected browser Google token as a cancelled login", async () => {
    setIdentityTokenVerifierForTests(async () => {
      throw new AppError("Ogiltig Google-inloggning", 401, "invalid_identity");
    });
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/google/browser-handoff",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "bad-token", nonce: "nonce" },
    });
    assert.equal(response.statusCode, 401);
    const body = response.json() as { error: string; code: string };
    assert.equal(body.error, "Ogiltig Google-inloggning");
    assert.equal(body.code, "invalid_identity");
    assert.equal(JSON.stringify(body).includes("handoff"), false);
    const users = await getPool().query(`SELECT id FROM users`);
    assert.equal(users.rowCount, 0);
    const handoffs = await getPool().query(`SELECT code FROM oauth_handoffs`);
    assert.equal(handoffs.rowCount, 0);
    await app.close();
  });

  it("sends a signed-in user with a journey to that journey after continue", async () => {
    const student = await createJourneyForStudent("Ella");
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.with.journey",
    }));
    const app = await createTestApp();
    const created = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(student.userId) },
      {
        method: "POST",
        url: "/api/auth/apple",
        headers: { "content-type": "application/json" },
        payload: { identityToken: "ok" },
      },
    );
    assert.equal(created.statusCode, 200);
    const body = created.json() as { redirectTo: string; claimedGuest: boolean };
    assert.equal(body.claimedGuest, true);
    assert.equal(body.redirectTo, `/journey/${student.journey.id}`);
    await app.close();
  });
});
