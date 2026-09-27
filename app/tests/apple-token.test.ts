import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  decodeProtectedHeader,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from "jose";
import {
  APPLE_CLIENT_SECRET_AUDIENCE,
  APPLE_CLIENT_SECRET_MAX_TTL_SECONDS,
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  APPLE_REVOKE_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  AppleTokenError,
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  setAppleTokenHttpForTests,
} from "../src/auth/apple-token.js";
import { createSessionToken } from "../src/auth/session.js";
import {
  setAppleNotificationVerifierForTests,
  setIdentityTokenVerifierForTests,
} from "../src/auth/oauth-verify.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetRateLimitsForTests } from "../src/http/rate-limit.js";
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

type Captured = { url: string; fields: URLSearchParams };

function installHttp(
  handler: (url: string, fields: URLSearchParams) => Response,
): Captured[] {
  const calls: Captured[] = [];
  setAppleTokenHttpForTests(async (url, init) => {
    const fields = new URLSearchParams(String(init.body ?? ""));
    calls.push({ url, fields });
    return handler(url, fields);
  });
  return calls;
}

async function useAppleKey(): Promise<{ publicKey: CryptoKey; pem: string }> {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  const pem = await exportPKCS8(privateKey);
  setEnv("APPLE_TEAM_ID", "PQ7M3B7VW5");
  setEnv("APPLE_KEY_ID", "ABCDE12345");
  setEnv("APPLE_PRIVATE_KEY", pem);
  setEnv("APPLE_BUNDLE_ID", "se.korpasset.app");
  setEnv("APPLE_CLIENT_ID", "se.korpasset.app");
  return { publicKey, pem };
}

function tokenResponse(refreshToken: string): Response {
  return new Response(
    JSON.stringify({
      access_token: "access-should-not-leak",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      id_token: "id-token-should-not-leak",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function refreshTokenFor(subject: string): Promise<string | null> {
  const result = await getPool().query(
    `SELECT apple_refresh_token FROM auth_identities
     WHERE provider = 'apple' AND provider_subject = $1`,
    [subject],
  );
  const value = result.rows[0]?.apple_refresh_token;
  return typeof value === "string" && value.trim() ? value : null;
}

function assertNoSecrets(body: string, secrets: string[]): void {
  for (const secret of secrets) {
    assert.equal(body.includes(secret), false);
  }
  assert.equal(body.includes("BEGIN PRIVATE KEY"), false);
  assert.equal(body.includes("client_secret"), false);
}

describe("Sign in with Apple token revoke", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    resetRateLimitsForTests();
    setIdentityTokenVerifierForTests(null);
    setAppleNotificationVerifierForTests(null);
    setAppleTokenHttpForTests(null);
    setEnv("APPLE_CLIENT_ID", "se.korpasset.app");
    setEnv("APPLE_BUNDLE_ID", "se.korpasset.app");
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
    setEnv("APPLE_KEY_ID", undefined);
    setEnv("APPLE_PRIVATE_KEY", undefined);
    setEnv("APPLE_TEAM_ID", undefined);
  });

  afterEach(() => {
    setIdentityTokenVerifierForTests(null);
    setAppleNotificationVerifierForTests(null);
    setAppleTokenHttpForTests(null);
    restoreEnv();
  });

  it("signs a client secret with Apple's ES256 claims and the documented exp maximum", async () => {
    const { publicKey, pem } = await useAppleKey();
    const now = Math.floor(Date.now() / 1000);
    const secret = await createAppleClientSecret(now);
    assert.equal(secret.includes(pem), false);
    assert.equal(secret.includes("BEGIN PRIVATE KEY"), false);

    const header = decodeProtectedHeader(secret);
    assert.equal(header.alg, "ES256");
    assert.equal(header.kid, "ABCDE12345");

    const { payload } = await jwtVerify(secret, publicKey, {
      issuer: "PQ7M3B7VW5",
      audience: APPLE_CLIENT_SECRET_AUDIENCE,
      subject: "se.korpasset.app",
    });
    assert.equal(payload.iss, "PQ7M3B7VW5");
    assert.equal(payload.sub, "se.korpasset.app");
    assert.equal(payload.aud, APPLE_CLIENT_SECRET_AUDIENCE);
    assert.equal(payload.iat, now);
    assert.equal(payload.exp, now + APPLE_CLIENT_SECRET_TTL_SECONDS);
    assert.ok((payload.exp ?? 0) - (payload.iat ?? 0) <= APPLE_CLIENT_SECRET_MAX_TTL_SECONDS);

    setEnv("APPLE_PRIVATE_KEY", pem.replace(/\n/g, "\\n"));
    const fromEscapedPem = await createAppleClientSecret(now);
    assert.equal(decodeProtectedHeader(fromEscapedPem).kid, "ABCDE12345");
  });

  it("exchanges the authorization code, stores the refresh token, and still accepts a later login without email or name", async () => {
    const { pem } = await useAppleKey();
    setIdentityTokenVerifierForTests(async (_provider, token) => {
      assert.equal(token, "valid-apple");
      return { provider: "apple", subject: "apple.sub.1", name: "Ella", email: "ella@privaterelay.appleid.com" };
    });
    const calls = installHttp((url) => {
      assert.equal(url, APPLE_TOKEN_ENDPOINT);
      return tokenResponse("refresh-token-test");
    });
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: {
        identityToken: "valid-apple",
        authorizationCode: "apple-auth-code",
        displayName: "Ella",
        nonce: "nonce-1",
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().created, true);
    assertNoSecrets(response.body, [pem, "apple-auth-code", "refresh-token-test", "access-should-not-leak"]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].fields.get("grant_type"), "authorization_code");
    assert.equal(calls[0].fields.get("code"), "apple-auth-code");
    assert.equal(calls[0].fields.get("client_id"), "se.korpasset.app");
    assert.equal(calls[0].fields.has("redirect_uri"), false);
    const clientSecret = calls[0].fields.get("client_secret") ?? "";
    assert.equal(decodeProtectedHeader(clientSecret).alg, "ES256");
    assert.equal(await refreshTokenFor("apple.sub.1"), "refresh-token-test");

    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.sub.1",
    }));
    const again = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple" },
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().created, false);
    assert.equal(calls.length, 1);
    assert.equal(await refreshTokenFor("apple.sub.1"), "refresh-token-test");
    const user = await getPool().query(
      `SELECT display_name FROM users u
       JOIN auth_identities a ON a.user_id = u.id
       WHERE a.provider_subject = 'apple.sub.1'`,
    );
    assert.equal(user.rows[0].display_name, "Ella");
    await app.close();
  });

  it("still logs in when Apple rejects or mangles the code exchange, and stores nothing", async () => {
    await useAppleKey();
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.sub.bad-exchange",
    }));
    installHttp(() => jsonResponse(400, { error: "invalid_grant" }));
    const app = await createTestApp();
    const rejected = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple", authorizationCode: "used-code" },
    });
    assert.equal(rejected.statusCode, 200);
    assert.equal(await refreshTokenFor("apple.sub.bad-exchange"), null);
    assert.equal(rejected.body.includes("used-code"), false);

    installHttp(() => new Response("not-json", { status: 200 }));
    const malformed = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple", authorizationCode: "malformed-code" },
    });
    assert.equal(malformed.statusCode, 200);
    assert.equal(await refreshTokenFor("apple.sub.bad-exchange"), null);
    assert.equal(malformed.body.includes("malformed-code"), false);
    await app.close();
  });

  it("logs in without a stored token when the Apple key is not configured", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.sub.unconfigured",
    }));
    const calls = installHttp(() => {
      throw new Error("Apple must not be called");
    });
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple", authorizationCode: "code-without-key" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(calls.length, 0);
    assert.equal(await refreshTokenFor("apple.sub.unconfigured"), null);
    assert.equal(response.body.includes("code-without-key"), false);
    await app.close();
  });

  it("does not put the authorization code into an AppleTokenError", async () => {
    await useAppleKey();
    installHttp(() => jsonResponse(400, { error: "invalid_client" }));
    await assert.rejects(
      () => exchangeAppleAuthorizationCode("super-secret-code"),
      (error: unknown) => {
        assert.ok(error instanceof AppleTokenError);
        assert.equal(error.kind, "rejected");
        assert.equal(error.appleError, "invalid_client");
        assert.equal(error.message.includes("super-secret-code"), false);
        assert.equal(String(error).includes("super-secret-code"), false);
        return true;
      },
    );
  });

  it("revokes the stored refresh token before deleting the Apple account, then allows a new sign-in", async () => {
    const { pem } = await useAppleKey();
    const subject = "apple.sub.revoke";
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject,
      name: "Ella",
    }));
    const calls = installHttp((url, fields) => {
      if (url === APPLE_TOKEN_ENDPOINT) return tokenResponse("refresh-token-test");
      assert.equal(url, APPLE_REVOKE_ENDPOINT);
      return new Response(null, { status: 200 });
    });
    const app = await createTestApp();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: {
        identityToken: "valid-apple",
        authorizationCode: "apple-auth-code",
        displayName: "Ella",
      },
    });
    assert.equal(login.statusCode, 200);
    const owner = await getPool().query(
      `SELECT user_id FROM auth_identities WHERE provider_subject = $1`,
      [subject],
    );
    const userId = String(owner.rows[0].user_id);

    setAppleTokenHttpForTests(async (url, init) => {
      const fields = new URLSearchParams(String(init.body ?? ""));
      calls.push({ url, fields });
      const stillThere = await getPool().query(
        `SELECT apple_refresh_token FROM auth_identities WHERE user_id = $1`,
        [userId],
      );
      assert.equal(stillThere.rows[0].apple_refresh_token, "refresh-token-test");
      assert.equal(url, APPLE_REVOKE_ENDPOINT);
      assert.equal(fields.get("token"), "refresh-token-test");
      assert.equal(fields.get("token_type_hint"), "refresh_token");
      assert.equal(fields.get("client_id"), "se.korpasset.app");
      assert.equal(decodeProtectedHeader(fields.get("client_secret") ?? "").alg, "ES256");
      return new Response(null, { status: 200 });
    });

    const deleted = await injectWithSession(app, { bilklar_session: createSessionToken(userId) }, {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(deleted.statusCode, 200);
    assert.match(deleted.body, /Kontot är raderat/);
    assert.doesNotMatch(deleted.body, /Inställningar/);
    assertNoSecrets(deleted.body, [pem, "refresh-token-test", "apple-auth-code"]);
    const cookie = deleted.cookies.find((item) => item.name === "bilklar_session");
    assert.equal(cookie?.value, "");

    const identities = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [userId],
    );
    assert.equal(identities.rows[0].n, 0);
    const tombstone = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [userId],
    );
    assert.equal(tombstone.rows[0].account_state, "deleted");
    assert.equal(tombstone.rows[0].display_name, null);

    const again = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "valid-apple" },
    });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().created, true);
    const next = await getPool().query(
      `SELECT user_id FROM auth_identities WHERE provider_subject = $1`,
      [subject],
    );
    assert.notEqual(String(next.rows[0].user_id), userId);
    await app.close();
  });

  it("keeps deleting a legacy Apple account that has no refresh token and does not claim a revoke", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple.legacy",
      displayName: "Ella",
    });
    const calls = installHttp(() => {
      throw new Error("Apple must not be called");
    });
    const app = await createTestApp();
    const deleted = await injectWithSession(app, { bilklar_session: createSessionToken(apple.userId) }, {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(deleted.statusCode, 200);
    assert.match(deleted.body, /kunde inte återkalla inloggningen hos Apple automatiskt/);
    assert.equal(calls.length, 0);
    const user = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [apple.userId],
    );
    assert.equal(user.rows[0].account_state, "deleted");
    await app.close();
  });

  it("deletes a Google account without calling Apple", async () => {
    const google = await continueWithOAuth({
      provider: "google",
      subject: "google.only",
      displayName: "Pappa",
    });
    const calls = installHttp(() => {
      throw new Error("Apple must not be called");
    });
    const app = await createTestApp();
    const deleted = await injectWithSession(app, { bilklar_session: createSessionToken(google.userId) }, {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(deleted.statusCode, 200);
    assert.doesNotMatch(deleted.body, /Inställningar/);
    assert.equal(calls.length, 0);
    await app.close();
  });

  it("does not delete when Apple is down, rejects the client, or the key is missing", async () => {
    const { pem } = await useAppleKey();
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple.keep",
      displayName: "Ella",
    });
    await getPool().query(
      `UPDATE auth_identities SET apple_refresh_token = $2
       WHERE provider = 'apple' AND provider_subject = $1`,
      ["apple.keep", "refresh-token-test"],
    );
    const app = await createTestApp();
    const session = { bilklar_session: createSessionToken(apple.userId) };

    async function attempt(status: number): Promise<void> {
      const response = await injectWithSession(app, session, {
        method: "POST",
        url: "/konto/radera",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ confirm: "RADERA" }),
      });
      assert.equal(response.statusCode, status);
      assertNoSecrets(response.body, [pem, "refresh-token-test"]);
      const user = await getPool().query(
        `SELECT account_state FROM users WHERE id = $1`,
        [apple.userId],
      );
      assert.equal(user.rows[0].account_state, "active");
      assert.equal(await refreshTokenFor("apple.keep"), "refresh-token-test");
    }

    installHttp(() => {
      throw new Error("econnrefused");
    });
    await attempt(503);

    installHttp(() => jsonResponse(503, { error: "server_error" }));
    await attempt(503);

    installHttp(() => jsonResponse(400, { error: "invalid_client" }));
    await attempt(502);

    setEnv("APPLE_PRIVATE_KEY", undefined);
    const calls = installHttp(() => {
      throw new Error("Apple must not be called");
    });
    const missing = await injectWithSession(app, session, {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(missing.statusCode, 503);
    assert.match(missing.body, /inte är konfigurerad/);
    assert.equal(calls.length, 0);
    assertNoSecrets(missing.body, ["refresh-token-test"]);
    const still = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [apple.userId],
    );
    assert.equal(still.rows[0].account_state, "active");
    await app.close();
  });

  it("treats invalid_grant on revoke as an already invalid token and still deletes locally", async () => {
    await useAppleKey();
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple.already-invalid",
      displayName: "Ella",
    });
    await getPool().query(
      `UPDATE auth_identities SET apple_refresh_token = 'refresh-token-test'
       WHERE provider_subject = 'apple.already-invalid'`,
    );
    const calls = installHttp((url, fields) => {
      assert.equal(url, APPLE_REVOKE_ENDPOINT);
      assert.equal(fields.get("token_type_hint"), "refresh_token");
      return jsonResponse(400, { error: "invalid_grant" });
    });
    const app = await createTestApp();
    const deleted = await injectWithSession(app, { bilklar_session: createSessionToken(apple.userId) }, {
      method: "POST",
      url: "/konto/radera",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "RADERA" }),
    });
    assert.equal(calls.length, 1);
    assert.equal(deleted.statusCode, 200);
    assert.doesNotMatch(deleted.body, /Inställningar/);
    assert.equal(deleted.body.includes("refresh-token-test"), false);
    const identities = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [apple.userId],
    );
    assert.equal(identities.rows[0].n, 0);
    await app.close();
  });

  it("rejects an unsigned Apple notification and revokes before a signed account-delete", async () => {
    const app = await createTestApp();
    const unsigned = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "not-a-jwt" },
    });
    assert.equal(unsigned.statusCode, 401);
    assert.equal(unsigned.json().code, "invalid_identity");

    await useAppleKey();
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple.notify",
      displayName: "Ella",
    });
    await getPool().query(
      `UPDATE auth_identities SET apple_refresh_token = 'refresh-token-test'
       WHERE provider_subject = 'apple.notify'`,
    );
    setAppleNotificationVerifierForTests(async () => ({
      type: "account-delete",
      sub: "apple.notify",
    }));
    const calls = installHttp(() => new Response(null, { status: 200 }));
    const deleted = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "signed-looking" },
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, APPLE_REVOKE_ENDPOINT);
    assert.equal(calls[0].fields.get("token"), "refresh-token-test");
    assert.equal(deleted.body.includes("refresh-token-test"), false);
    const user = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [apple.userId],
    );
    assert.equal(user.rows[0].account_state, "deleted");

    const both = await continueWithOAuth({
      provider: "google",
      subject: "google.keep",
      displayName: "Pappa",
    });
    await continueWithOAuth({
      provider: "apple",
      subject: "apple.consent",
      sessionUserId: both.userId,
    });
    await getPool().query(
      `UPDATE auth_identities SET apple_refresh_token = 'refresh-token-consent'
       WHERE provider_subject = 'apple.consent'`,
    );
    setAppleNotificationVerifierForTests(async () => ({
      type: "consent-revoked",
      sub: "apple.consent",
    }));
    const down = installHttp(() => jsonResponse(503, { error: "temporarily_unavailable" }));
    const blocked = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "consent-jwt" },
    });
    assert.equal(blocked.statusCode, 503);
    assert.equal(down.length, 1);
    assert.equal(blocked.body.includes("refresh-token-consent"), false);
    const remaining = await getPool().query(
      `SELECT provider FROM auth_identities WHERE user_id = $1 ORDER BY provider`,
      [both.userId],
    );
    assert.deepEqual(
      remaining.rows.map((row) => row.provider),
      ["apple", "google"],
    );
    await app.close();
  });
});
