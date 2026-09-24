import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import {
  setIdentityTokenVerifierForTests,
  type OAuthProvider,
} from "../src/auth/oauth-verify.js";
import { parseInviteReturnTo } from "../src/http/oauth.js";
import { createInvitation } from "../src/services/invitations.js";
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

describe("native shell and deep links", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    setIdentityTokenVerifierForTests(null);
    setEnv("APPLE_CLIENT_ID", "se.korpasset.app");
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
    setEnv("APPLE_TEAM_ID", "TEAM123");
    setEnv("APPLE_BUNDLE_ID", "se.korpasset.app");
    setEnv("ANDROID_PACKAGE_NAME", "se.korpasset.app");
    setEnv(
      "ANDROID_SHA256_CERT_FINGERPRINTS",
      "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    );
  });

  afterEach(() => {
    setIdentityTokenVerifierForTests(null);
    restoreEnv();
  });

  it("serves AASA for Universal Links without indexing product paths as signup", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/apple-app-site-association",
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    const body = response.json() as {
      applinks: { details: Array<{ appID: string; paths: string[] }> };
      webcredentials: { apps: string[] };
    };
    assert.equal(body.applinks.details[0].appID, "TEAM123.se.korpasset.app");
    assert.deepEqual(body.applinks.details[0].paths, [
      "/invite/*",
      "/app",
      "/onboarding",
      "/konto",
    ]);
    assert.deepEqual(
      (body.applinks.details[0] as { components: Array<Record<string, string>> }).components,
      [
        { "/": "/invite/*" },
        { "/": "/app" },
        { "/": "/onboarding" },
        { "/": "/konto" },
      ],
    );
    assert.deepEqual(body.webcredentials.apps, ["TEAM123.se.korpasset.app"]);
    await app.close();
  });

  it("serves Android assetlinks when Play SHA-256 fingerprints are set", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/assetlinks.json",
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /application\/json/);
    const body = response.json() as Array<{
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    assert.equal(body.length, 1);
    assert.equal(body[0].target.package_name, "se.korpasset.app");
    assert.deepEqual(body[0].target.sha256_cert_fingerprints, [
      "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    ]);
    await app.close();
  });

  it("serves an empty assetlinks list when no fingerprints are configured", async () => {
    setEnv("ANDROID_SHA256_CERT_FINGERPRINTS", undefined);
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/assetlinks.json",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
    await app.close();
  });

  it("wires /app for the native shell: noindex, safe-area viewport, OAuth script and native cookie", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/app" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /noindex, nofollow/);
    assert.match(response.body, /viewport-fit=cover/);
    assert.match(response.body, /src="\/app-oauth\.js"/);
    assert.match(response.body, /window\.KORPASSET_OAUTH/);
    assert.match(response.body, /data-oauth-provider="apple"/);
    assert.match(response.body, /data-oauth-provider="google"/);
    const native = response.cookies.find((cookie) => cookie.name === "korpasset_native");
    assert.ok(native);
    assert.equal(native.value, "1");
    assert.notEqual(native.httpOnly, true);
    await app.close();
  });

  it("serves app-oauth.js and attaches it on /konto Koppla-buttons", async () => {
    const guest = await createGuestUser("Ella");
    const app = await createTestApp();
    const script = await app.inject({ method: "GET", url: "/app-oauth.js" });
    assert.equal(script.statusCode, 200);
    assert.match(script.body, /data-oauth-provider/);
    assert.match(script.body, /\/api\/auth\//);
    assert.match(script.body, /appUrlOpen/);
    assert.match(script.body, /getLaunchUrl/);

    const page = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(guest.id) },
      { method: "GET", url: "/konto" },
    );
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /src="\/app-oauth\.js"/);
    assert.match(page.body, /data-oauth-provider="apple"/);
    assert.match(page.body, /Koppla Apple/);
    await app.close();
  });

  it("accepts an invitation when OAuth continue sends returnTo /invite/<token>", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const guest = await createGuestUser("Pappa");
    setIdentityTokenVerifierForTests(async (provider: OAuthProvider) => {
      assert.equal(provider, "apple");
      return { provider: "apple", subject: "apple.deeplink", name: "Pappa" };
    });
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
    await app.close();
  });

  it("ignores open-redirect returnTo values", async () => {
    assert.equal(parseInviteReturnTo("https://evil.example/invite/abc"), null);
    assert.equal(parseInviteReturnTo("/invite/../konto"), null);
    assert.equal(parseInviteReturnTo("/invite/ok_token-1"), "ok_token-1");

    setIdentityTokenVerifierForTests(async () => ({
      provider: "google",
      subject: "google.open-redirect",
    }));
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/google",
      headers: { "content-type": "application/json" },
      payload: {
        identityToken: "valid",
        returnTo: "https://evil.example/phish",
      },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { redirectTo: string };
    assert.equal(body.redirectTo, "/onboarding");
    await app.close();
  });
});
