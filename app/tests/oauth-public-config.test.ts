import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  config,
  sanitizePublicGoogleClientId,
} from "../src/config.js";
import { publicOAuthConfig } from "../src/http/layout.js";
import { createTestApp } from "./helpers.js";

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

describe("public Google OAuth client IDs", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("keeps usable Google client IDs including test fixtures", () => {
    assert.equal(
      sanitizePublicGoogleClientId("google-web.apps.googleusercontent.com"),
      "google-web.apps.googleusercontent.com",
    );
    assert.equal(
      sanitizePublicGoogleClientId(" 123-ios.apps.googleusercontent.com "),
      "123-ios.apps.googleusercontent.com",
    );
  });

  it("drops empty values, docs placeholders, and non-Google client IDs", () => {
    assert.equal(sanitizePublicGoogleClientId(""), "");
    assert.equal(sanitizePublicGoogleClientId("   "), "");
    assert.equal(sanitizePublicGoogleClientId(undefined), "");
    assert.equal(
      sanitizePublicGoogleClientId("<web-client-id>.apps.googleusercontent.com"),
      "",
    );
    assert.equal(
      sanitizePublicGoogleClientId("<ios-client-id>.apps.googleusercontent.com"),
      "",
    );
    assert.equal(sanitizePublicGoogleClientId("not-a-client-id"), "");
    assert.equal(sanitizePublicGoogleClientId("se.korpasset.app"), "");
  });

  it("does not publish placeholder Google IDs to the native shell", () => {
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
    setEnv("GOOGLE_WEB_CLIENT_ID", "<web-client-id>.apps.googleusercontent.com");
    setEnv("GOOGLE_IOS_CLIENT_ID", "<ios-client-id>.apps.googleusercontent.com");

    const published = publicOAuthConfig();
    assert.equal(published.googleWebClientId, "google-web.apps.googleusercontent.com");
    assert.equal(published.googleIosClientId, "");
    assert.equal(config.isOAuthConfigured("google"), true);
  });

  it("treats placeholder-only Google env as unconfigured", () => {
    setEnv("GOOGLE_CLIENT_ID", "<web-client-id>.apps.googleusercontent.com");
    setEnv("GOOGLE_CLIENT_IDS", "<web>,<ios>,<android>");
    setEnv("GOOGLE_WEB_CLIENT_ID", "<web-client-id>.apps.googleusercontent.com");
    setEnv("GOOGLE_IOS_CLIENT_ID", "<ios-client-id>.apps.googleusercontent.com");

    assert.deepEqual(config.googleAudiences, []);
    assert.equal(config.googleWebClientId, "");
    assert.equal(config.googleIosClientId, "");
    assert.equal(config.isOAuthConfigured("google"), false);
  });

  it("publishes real-looking web and iOS client IDs", () => {
    setEnv("GOOGLE_CLIENT_ID", "123-web.apps.googleusercontent.com");
    setEnv("GOOGLE_WEB_CLIENT_ID", "123-web.apps.googleusercontent.com");
    setEnv("GOOGLE_IOS_CLIENT_ID", "123-ios.apps.googleusercontent.com");

    const published = publicOAuthConfig();
    assert.equal(published.googleWebClientId, "123-web.apps.googleusercontent.com");
    assert.equal(published.googleIosClientId, "123-ios.apps.googleusercontent.com");
    assert.deepEqual(config.googleAudiences, [
      "123-web.apps.googleusercontent.com",
      "123-ios.apps.googleusercontent.com",
    ]);
  });

  it("omits placeholder IDs from /app KORPASSET_OAUTH", async () => {
    setEnv("GOOGLE_CLIENT_ID", "google-web.apps.googleusercontent.com");
    setEnv("GOOGLE_WEB_CLIENT_ID", "<web-client-id>.apps.googleusercontent.com");
    setEnv("GOOGLE_IOS_CLIENT_ID", "<ios-client-id>.apps.googleusercontent.com");

    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/app" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /window\.KORPASSET_OAUTH/);
    assert.match(response.body, /"googleWebClientId":"google-web.apps.googleusercontent.com"/);
    assert.match(response.body, /"googleIosClientId":""/);
    assert.doesNotMatch(response.body, /<web-client-id>/);
    assert.doesNotMatch(response.body, /<ios-client-id>/);
    await app.close();
  });

  it("guards native Google login on iOS when the iOS client ID is missing", async () => {
    const app = await createTestApp();
    const script = await app.inject({ method: "GET", url: "/app-oauth.js" });
    assert.equal(script.statusCode, 200);
    assert.match(script.body, /googleReady/);
    assert.match(script.body, /iOSServerClientId/);
    assert.match(script.body, /Google-inloggning på iPhone är inte redo/);
    assert.match(script.body, /platform\(\) === "ios"/);
    await app.close();
  });
});
