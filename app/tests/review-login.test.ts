import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const EMAIL = "korpasset@gmail.com";
const PASSWORD = "review-secret-1";
const ANDROID_APP =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7a Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.88 Mobile Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36";

function setReviewEnv(): void {
  process.env.PLAY_REVIEW_EMAIL = EMAIL;
  process.env.PLAY_REVIEW_PASSWORD = PASSWORD;
}

function clearReviewEnv(): void {
  delete process.env.PLAY_REVIEW_EMAIL;
  delete process.env.PLAY_REVIEW_PASSWORD;
}

describe("play review login", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    clearReviewEnv();
  });

  afterEach(() => {
    clearReviewEnv();
  });

  it("hides the email form until review credentials are configured", async () => {
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/app" });
    assert.equal(page.statusCode, 200);
    assert.doesNotMatch(page.body, /review-password/);
    assert.doesNotMatch(page.body, /Logga in med Google-kontot/);

    const posted = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ email: EMAIL, password: PASSWORD }).toString(),
    });
    assert.equal(posted.statusCode, 404);
    await app.close();
  });

  it("shows email login only in the Android app while review credentials are set", async () => {
    setReviewEnv();
    const app = await createTestApp();
    const web = await app.inject({ method: "GET", url: "/app" });
    assert.doesNotMatch(web.body, /review-password/);
    assert.doesNotMatch(web.body, /Logga in med Google-kontot/);
    assert.match(web.body, /Fortsätt med Apple/);
    assert.match(web.body, /Fortsätt med Google/);

    const chrome = await app.inject({
      method: "GET",
      url: "/app",
      headers: { "user-agent": ANDROID_CHROME },
    });
    assert.doesNotMatch(chrome.body, /review-password/);
    assert.match(chrome.body, /Fortsätt med Google/);

    const phone = await app.inject({
      method: "GET",
      url: "/app",
      headers: { "user-agent": ANDROID_APP },
    });
    assert.match(phone.body, /<h1>Logga in<\/h1>/);
    assert.match(phone.body, /Logga in med Google-kontot/);
    assert.match(phone.body, /Skriv e-post och lösenord för kontot här i appen/);
    assert.match(phone.body, /name="email"/);
    assert.match(phone.body, /name="password"/);
    assert.match(phone.body, new RegExp(`value="${EMAIL}"`));
    assert.equal(phone.body.includes(PASSWORD), false);
    assert.doesNotMatch(phone.body, /Fortsätt med Apple/);
    assert.doesNotMatch(phone.body, /Fortsätt med Google/);
    assert.doesNotMatch(phone.body, /oauth-continue/);
    await app.close();
  });

  it("signs the review account in and reuses the same user", async () => {
    setReviewEnv();
    const app = await createTestApp();

    const first = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        email: "  Korpasset@gmail.com ",
        password: PASSWORD,
      }).toString(),
    });
    assert.equal(first.statusCode, 303);
    assert.equal(first.headers.location, "/onboarding");
    assert.ok(first.cookies.find((item) => item.name === "bilklar_session")?.value);
    assert.equal(JSON.stringify(first.body).includes(PASSWORD), false);

    const identities = await getPool().query(
      `SELECT user_id FROM auth_identities WHERE provider = 'email_magic_link' AND provider_subject = $1`,
      [EMAIL],
    );
    assert.equal(identities.rowCount, 1);
    const userId = identities.rows[0].user_id as string;

    const second = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ email: EMAIL, password: PASSWORD }).toString(),
    });
    assert.equal(second.statusCode, 303);
    const again = await getPool().query(
      `SELECT user_id FROM auth_identities WHERE provider = 'email_magic_link'`,
    );
    assert.equal(again.rowCount, 1);
    assert.equal(again.rows[0].user_id, userId);

    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ email: EMAIL, password: "not-the-password" }).toString(),
    });
    assert.equal(wrong.statusCode, 303);
    assert.equal(wrong.headers.location, "/app?review_error=credentials");
    assert.equal(wrong.cookies.find((item) => item.name === "bilklar_session"), undefined);

    const failed = await app.inject({
      method: "GET",
      url: "/app?review_error=credentials",
      headers: { "user-agent": ANDROID_APP },
    });
    assert.match(failed.body, /Fel e-post eller lösenord/);
    assert.match(failed.body, /review-password/);
    assert.doesNotMatch(failed.body, /Fortsätt med Google/);
    assert.equal(failed.body.includes("not-the-password"), false);
    await app.close();
  });

  it("does not sign in a suspended review account", async () => {
    setReviewEnv();
    const app = await createTestApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ email: EMAIL, password: PASSWORD }).toString(),
    });
    assert.equal(created.statusCode, 303);
    await getPool().query(
      `UPDATE users SET account_state = 'suspended'
       WHERE id = (SELECT user_id FROM auth_identities WHERE provider_subject = $1)`,
      [EMAIL],
    );
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/review-login",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ email: EMAIL, password: PASSWORD }).toString(),
    });
    assert.equal(blocked.statusCode, 303);
    assert.equal(blocked.headers.location, "/app?review_error=credentials");
    await app.close();
  });
});
