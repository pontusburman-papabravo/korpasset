import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AppError } from "../src/errors.js";
import { createSessionToken } from "../src/auth/session.js";
import {
  setIdentityTokenVerifierForTests,
  type OAuthProvider,
} from "../src/auth/oauth-verify.js";
import { getPool } from "../src/db/pool.js";
import { createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
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
    setEnv("APPLE_TEAM_ID", "TEAM123");
    setEnv("ANDROID_SHA256_CERT_FINGERPRINTS", "AA:BB:CC");
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

  it("shows Apple and Google continue on /app for anonymous native users", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/app" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Fortsätt med Apple/);
    assert.match(response.body, /Fortsätt med Google/);
    assert.match(response.body, /Första gången skapas ditt konto/);
    const native = response.cookies.find((cookie) => cookie.name === "korpasset_native");
    assert.ok(native);
    assert.equal(native.value, "1");
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

  it("claims a guest supervisor and accepts the invitation returnTo", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
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
        payload: {
          identityToken: "valid",
          returnTo: `/invite/${invitation.token}`,
        },
      },
    );
    assert.equal(response.statusCode, 200);
    const body = response.json() as { redirectTo: string; claimedGuest: boolean };
    assert.equal(body.claimedGuest, true);
    assert.equal(body.redirectTo, `/journey/${student.journey.id}`);

    const user = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [guest.id],
    );
    assert.equal(user.rows[0].account_state, "active");
    const collab = await getPool().query(
      `SELECT status FROM journey_collaborators WHERE journey_id = $1 AND user_id = $2`,
      [student.journey.id, guest.id],
    );
    assert.equal(collab.rows[0].status, "active");
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

  it("lets the user delete the account from /konto", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.delete",
      name: "Ella",
    }));
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "ok" },
    });
    const session = created.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(session);
    const page = await injectWithSession(
      app,
      { bilklar_session: session.value },
      { method: "GET", url: "/konto" },
    );
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Radera konto/);
    assert.match(page.body, /Apple/);
    assert.match(page.body, /href="\/integritet"/);

    const deleted = await injectWithSession(
      app,
      { bilklar_session: session.value },
      {
        method: "POST",
        url: "/konto/radera",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ confirm: "RADERA" }),
      },
    );
    assert.equal(deleted.statusCode, 200);
    assert.match(deleted.body, /Kontot är raderat/);
    const users = await getPool().query(`SELECT account_state FROM users`);
    assert.equal(users.rows[0].account_state, "deleted");
    const identities = await getPool().query(`SELECT count(*)::int AS n FROM auth_identities`);
    assert.equal(identities.rows[0].n, 0);
    await app.close();
  });

  it("serves Universal Link and App Link well-known files", async () => {
    const app = await createTestApp();
    const apple = await app.inject({
      method: "GET",
      url: "/.well-known/apple-app-site-association",
    });
    assert.equal(apple.statusCode, 200);
    const appleBody = apple.json() as {
      applinks: { details: Array<{ appID: string; paths: string[] }> };
    };
    assert.equal(appleBody.applinks.details[0].appID, "TEAM123.se.korpasset.app");
    assert.ok(appleBody.applinks.details[0].paths.includes("/invite/*"));

    const android = await app.inject({
      method: "GET",
      url: "/.well-known/assetlinks.json",
    });
    assert.equal(android.statusCode, 200);
    const androidBody = android.json() as Array<{
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    assert.equal(androidBody[0].target.package_name, "se.korpasset.app");
    assert.deepEqual(androidBody[0].target.sha256_cert_fingerprints, ["AA:BB:CC"]);
    await app.close();
  });

  it("redirects a signed-in /app user with no journey to onboarding", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.onboard",
      name: "Ella",
    }));
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "ok" },
    });
    const session = created.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(session);
    const response = await injectWithSession(
      app,
      { bilklar_session: session.value },
      { method: "GET", url: "/app" },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");
    await app.close();
  });
});
