import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import {
  setIdentityTokenVerifierForTests,
  type OAuthProvider,
} from "../src/auth/oauth-verify.js";
import { getPool } from "../src/db/pool.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
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

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("konto UI", () => {
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

  it("shows name, login providers, logout, deletion and legal links — not Premium", async () => {
    const guest = await createGuestUser("Ella");
    const app = await createTestApp();
    const page = await injectWithSession(app, session(guest.id), {
      method: "GET",
      url: "/konto",
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /value="Ella"/);
    assert.match(page.body, /inte en roll och inte en prenumeration/);
    assert.match(page.body, /Apple/);
    assert.match(page.body, /Google/);
    assert.match(page.body, /data-provider="apple" data-linked="false"/);
    assert.match(page.body, /data-provider="google" data-linked="false"/);
    assert.match(page.body, /Koppla Apple/);
    assert.match(page.body, /Koppla Google/);
    assert.match(page.body, /provider <code>sub<\/code>/);
    assert.match(page.body, /Logga ut/);
    assert.match(page.body, /Radera mitt konto/);
    assert.match(page.body, /href="\/integritet"/);
    assert.match(page.body, /href="\/villkor"/);
    assert.doesNotMatch(page.body, /Premium/i);
    assert.doesNotMatch(page.body, /trial/i);
    assert.doesNotMatch(page.body, /expired/i);
    assert.doesNotMatch(page.body, /type="email"/);
    await app.close();
  });

  it("shows a linked Apple identity and lets the user attach Google", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-konto-1",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const page = await injectWithSession(app, session(apple.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(page.body, /data-provider="apple" data-linked="true"/);
    assert.match(page.body, /Apple är kopplat/);
    assert.match(page.body, /data-provider="google" data-linked="false"/);
    assert.match(page.body, /Koppla Google/);
    assert.doesNotMatch(page.body, /Koppla Apple/);

    const linked = await continueWithOAuth({
      provider: "google",
      subject: "google-konto-1",
      sessionUserId: apple.userId,
    });
    assert.equal(linked.userId, apple.userId);
    const both = await injectWithSession(app, session(apple.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(both.body, /data-provider="apple" data-linked="true"/);
    assert.match(both.body, /data-provider="google" data-linked="true"/);
    assert.doesNotMatch(both.body, /Koppla Apple/);
    assert.doesNotMatch(both.body, /Koppla Google/);
    await app.close();
  });

  it("returns 409 when linking an identity that belongs to another user", async () => {
    const owner = await continueWithOAuth({
      provider: "google",
      subject: "google-taken-konto",
      displayName: "Ägare",
    });
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-link-conflict",
      displayName: "Ella",
    });
    setIdentityTokenVerifierForTests(async (provider: OAuthProvider) => {
      assert.equal(provider, "google");
      return { provider: "google", subject: "google-taken-konto" };
    });
    const app = await createTestApp();
    const conflict = await injectWithSession(app, session(apple.userId), {
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "stolen" },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().code, "identity_on_other_user");
    const page = await injectWithSession(app, session(apple.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(page.body, /data-provider="apple" data-linked="true"/);
    assert.match(page.body, /data-provider="google" data-linked="false"/);
    assert.ok(owner.userId);
    await app.close();
  });

  it("logs out without deleting identities", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-logout",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const logout = await injectWithSession(app, session(apple.userId), {
      method: "POST",
      url: "/logout",
    });
    assert.equal(logout.statusCode, 302);
    assert.equal(logout.headers.location, "/app");
    const cookie = logout.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(cookie);
    assert.equal(cookie.value, "");
    const identities = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [apple.userId],
    );
    assert.equal(identities.rows[0].n, 1);
    const konto = await app.inject({ method: "GET", url: "/konto" });
    assert.equal(konto.statusCode, 401);
    await app.close();
  });

  it("deletes the account from /konto without touching the waitlist", async () => {
    await saveInterestSignup({
      name: "Ella",
      email: "ella@example.com",
      role: "student",
    });
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-delete-konto",
      displayName: "Ella",
    });
    await createJourneyForStudent("Ella", apple.userId);
    const app = await createTestApp();
    const deleted = await injectWithSession(app, session(apple.userId), {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(deleted.statusCode, 200);
    assert.match(deleted.body, /Kontot är raderat/);
    const user = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [apple.userId],
    );
    assert.equal(user.rows[0].account_state, "deleted");
    assert.equal(user.rows[0].display_name, null);
    const identities = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [apple.userId],
    );
    assert.equal(identities.rows[0].n, 0);
    const journeys = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys WHERE student_user_id = $1`,
      [apple.userId],
    );
    assert.equal(journeys.rows[0].n, 0);
    const waitlist = await getPool().query(
      `SELECT count(*)::int AS n FROM interest_signups WHERE email_normalized = 'ella@example.com'`,
    );
    assert.equal(waitlist.rows[0].n, 1);
    const cookie = deleted.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(cookie);
    assert.equal(cookie.value, "");
    await app.close();
  });
});
