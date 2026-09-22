import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CONTENT_SECURITY_POLICY } from "../src/http/security-headers.js";
import { OAUTH_RATE_LIMIT } from "../src/http/rate-limit.js";
import {
  setAppleNotificationVerifierForTests,
  setIdentityTokenVerifierForTests,
} from "../src/auth/oauth-verify.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createTestApp } from "./helpers.js";
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

describe("production hardening", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    setIdentityTokenVerifierForTests(null);
    setAppleNotificationVerifierForTests(null);
    setEnv("APPLE_CLIENT_ID", "se.korpasset.app");
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
  });

  afterEach(() => {
    setIdentityTokenVerifierForTests(null);
    setAppleNotificationVerifierForTests(null);
    restoreEnv();
  });

  it("sends security headers on /app and HSTS when the origin is https", async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://korpasset.se";
    try {
      const app = await createTestApp();
      const response = await app.inject({ method: "GET", url: "/app" });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["x-content-type-options"], "nosniff");
      assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
      assert.equal(response.headers["x-frame-options"], "DENY");
      assert.equal(response.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
      assert.equal(
        response.headers["strict-transport-security"],
        "max-age=31536000; includeSubDomains",
      );
      await app.close();
    } finally {
      restoreEnvValue("APP_BASE_URL", previous);
    }
  });

  it("rate-limits OAuth continue after the configured burst", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "google",
      subject: "google.rate",
    }));
    const app = await createTestApp();
    for (let i = 0; i < OAUTH_RATE_LIMIT.limit; i += 1) {
      const ok = await app.inject({
        method: "POST",
        url: "/api/auth/google",
        headers: { "content-type": "application/json" },
        payload: { identityToken: `t${i}` },
      });
      assert.equal(ok.statusCode, 200);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "too-many" },
    });
    assert.equal(blocked.statusCode, 429);
    await app.close();
  });

  it("tombstones on Apple account-delete and unlinks Apple on consent-revoked", async () => {
    const appleOnly = await continueWithOAuth({
      provider: "apple",
      subject: "apple.delete",
      displayName: "Ella",
    });
    const both = await continueWithOAuth({
      provider: "google",
      subject: "google.keep",
      displayName: "Pappa",
    });
    await continueWithOAuth({
      provider: "apple",
      subject: "apple.revoke",
      sessionUserId: both.userId,
    });

    setAppleNotificationVerifierForTests(async (payload) => {
      if (payload === "delete-jwt") {
        return { type: "account-delete", sub: "apple.delete" };
      }
      if (payload === "revoke-jwt") {
        return { type: "consent-revoked", sub: "apple.revoke" };
      }
      return { type: "email-disabled", sub: "unknown" };
    });

    const app = await createTestApp();
    const deleted = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "delete-jwt" },
    });
    assert.equal(deleted.statusCode, 200);

    const deletedUser = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [appleOnly.userId],
    );
    assert.equal(deletedUser.rows[0].account_state, "deleted");
    const gone = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [appleOnly.userId],
    );
    assert.equal(gone.rows[0].n, 0);

    const revoked = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "revoke-jwt" },
    });
    assert.equal(revoked.statusCode, 200);
    const remaining = await getPool().query(
      `SELECT provider FROM auth_identities WHERE user_id = $1`,
      [both.userId],
    );
    assert.deepEqual(
      remaining.rows.map((row) => row.provider),
      ["google"],
    );
    const stillActive = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [both.userId],
    );
    assert.equal(stillActive.rows[0].account_state, "active");

    const unknown = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: { payload: "unknown-jwt" },
    });
    assert.equal(unknown.statusCode, 200);

    const missing = await app.inject({
      method: "POST",
      url: "/api/apple/notifications",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(missing.statusCode, 400);
    await app.close();
  });

  it("keeps product session SameSite=Lax after continue", async () => {
    setIdentityTokenVerifierForTests(async () => ({
      provider: "apple",
      subject: "apple.cookie",
    }));
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/apple",
      headers: { "content-type": "application/json" },
      payload: { identityToken: "ok" },
    });
    assert.equal(response.statusCode, 200);
    const cookie = response.cookies.find((item) => item.name === "bilklar_session");
    assert.ok(cookie);
    assert.equal(cookie.httpOnly, true);
    assert.equal(String(cookie.sameSite).toLowerCase(), "lax");
    await app.close();
  });

  it("wires a nonce from the native OAuth client script", async () => {
    const app = await createTestApp();
    const script = await app.inject({ method: "GET", url: "/app-oauth.js" });
    assert.equal(script.statusCode, 200);
    assert.match(script.body, /randomNonce/);
    assert.match(script.body, /nonce: nonce/);
    await app.close();
  });
});

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
