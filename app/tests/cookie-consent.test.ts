import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";
import { loginPage } from "../src/http/admin-pages.js";
import { CONTENT_SECURITY_POLICY } from "../src/http/security-headers.js";

const previousGa = process.env.GA_MEASUREMENT_ID;

describe("cookie consent", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    delete process.env.GA_MEASUREMENT_ID;
  });

  afterEach(() => {
    if (previousGa === undefined) delete process.env.GA_MEASUREMENT_ID;
    else process.env.GA_MEASUREMENT_ID = previousGa;
  });

  it("asks for consent before any analytics tag and treats reject as a peer of accept", async () => {
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.equal(home.cookies.length, 0);
    assert.match(home.body, /src="\/consent\.js"/);
    assert.match(home.body, /Godkänn alla/);
    assert.match(home.body, /Bara nödvändiga/);
    assert.match(home.body, /Anpassa/);
    assert.match(home.body, /consent__btn--primary/);
    assert.doesNotMatch(home.body, /googletagmanager\.com/);
    assert.doesNotMatch(home.body, /google-analytics\.com/);
    assert.match(home.body, /"gaMeasurementId":""/);
    await app.close();
  });

  it("publishes a cookie policy and keeps the choice reopenable", async () => {
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/cookies" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Cookiepolicy/);
    assert.match(page.body, /korpasset_consent/);
    assert.match(page.body, /Google Analytics 4/);
    assert.match(page.body, /inte ifyllda i förväg/);
    assert.match(page.body, /data-consent-open/);
    assert.match(page.body, /IMY/);
    assert.doesNotMatch(page.body, /googletagmanager\.com/);
    await app.close();
  });

  it("does not put the public banner on the admin login page", () => {
    const html = loginPage();
    assert.doesNotMatch(html, /src="\/consent\.js"/);
    assert.doesNotMatch(html, /data-consent-open/);
    assert.doesNotMatch(html, /Godkänn alla/);
  });

  it("passes a GA4 id to the page only when the env value is a real measurement id", async () => {
    process.env.GA_MEASUREMENT_ID = "G-TEST123";
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.match(home.body, /"gaMeasurementId":"G-TEST123"/);
    assert.doesNotMatch(home.body, /googletagmanager\.com/);
    await app.close();

    process.env.GA_MEASUREMENT_ID = "<not-an-id>";
    const again = await createTestApp();
    const second = await again.inject({ method: "GET", url: "/" });
    assert.match(second.body, /"gaMeasurementId":""/);
    await again.close();
  });

  it("wires the production GA4 id through Compose without putting the tag in the HTML", () => {
    const compose = fs.readFileSync(new URL("../../deploy/docker-compose.yml", import.meta.url), "utf8");
    assert.match(compose, /GA_MEASUREMENT_ID: \$\{GA_MEASUREMENT_ID:-G-H275WSBLJ8\}/);
  });

  it("allows the Google tag to run after consent without opening the rest of the web", () => {
    assert.match(CONTENT_SECURITY_POLICY, /https:\/\/www\.googletagmanager\.com/);
    assert.match(CONTENT_SECURITY_POLICY, /https:\/\/www\.google-analytics\.com/);
    assert.doesNotMatch(CONTENT_SECURITY_POLICY, /\*\.google\.com/);
    assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  });
});
