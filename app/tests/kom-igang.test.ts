import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { APP_STORE_URL, PLAY_STORE_URL } from "../src/http/landing.js";
import { HERO_HEADLINES } from "../src/http/kom-igang.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { setMailerForTests, type OutboundEmail } from "../src/services/email.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("campaign page /kom-igang", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    delete process.env.ANDROID_PLAY_LIVE;
  });

  afterEach(() => {
    setMailerForTests(null);
    delete process.env.RESEND_API_KEY;
    delete process.env.ANDROID_PLAY_LIVE;
  });

  it("is a noindex conversion page and stays out of the site navigation", async () => {
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: "/kom-igang?utm_source=meta&utm_medium=paid&utm_campaign=korpasset&utm_content=video_a&fbclid=IwAR0testclick",
    });
    assert.equal(page.statusCode, 200);
    assert.equal(page.body.match(/<h1/g)?.length, 1);
    assert.ok(page.body.includes(`<h1 id="go-h1">${HERO_HEADLINES.a}</h1>`));
    assert.match(page.body, /Privat övningskörning · B-körkort/);
    assert.match(page.body, /Planera nästa körpass/);
    assert.match(page.body, /Flera handledare delar samma historik/);
    assert.match(page.body, /Gratis under betaperioden/);
    assert.match(page.body, /Hämta Körpasset för iPhone/);
    assert.match(page.body, /Finns i App Store/);
    assert.match(page.body, /Android – meddela mig när appen finns/);
    assert.match(page.body, /Google Play väntar på godkännande/);
    assert.match(page.body, /En elev\. Flera handledare\. Samma körkortsresa\./);
    assert.match(page.body, /Ingen extra administration/);
    assert.match(page.body, /Nästa fokus/);
    assert.match(page.body, /Cirkulationsplats/);
    assert.match(page.body, /noindex, nofollow/);
    assert.match(page.headers["x-robots-tag"] as string, /noindex, nofollow/);
    assert.match(page.body, new RegExp(APP_STORE_URL.replaceAll("/", "\\/")));
    assert.match(page.body, /src="\/kom-igang\.js"/);
    assert.match(page.body, /src="\/consent\.js"/);
    assert.match(page.body, /for="android-email"/);
    assert.match(page.body, /Meddela mig/);
    assert.match(page.body, /data-go-sticky/);
    assert.match(page.body, /Hämta appen/);
    assert.match(page.body, /name="utm_source" value="meta"/);
    assert.match(page.body, /name="fbclid" value="IwAR0testclick"/);
    assert.match(page.body, /class="site-logo" href="\/\?utm_source=meta/);
    assert.match(page.body, /class="go-home" href="\/\?utm_source=meta[^"]*">Förstasidan</);
    assert.match(page.body, /href="\/integritet\?utm_source=meta/);
    assert.doesNotMatch(page.body, /class="site-logo" href="\/kom-igang/);
    assert.doesNotMatch(page.body, /href="\/app"/);
    assert.doesNotMatch(page.body, /Logga in/);
    assert.doesNotMatch(page.body, /Öppna appen/);
    assert.doesNotMatch(page.body, /href="\/ovningskorning/);
    assert.doesNotMatch(page.body, /transportstyrelsen/i);
    assert.doesNotMatch(page.body, /Vad är Körpasset\?/);
    const main = page.body.match(/<main[\s\S]*<\/main>/)?.[0] ?? "";
    assert.doesNotMatch(main, /intresseanmälan/i);

    const home = await app.inject({ method: "GET", url: "/" });
    const header = home.body.match(/<header class="site-nav">[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.doesNotMatch(header, /kom-igang/);
    assert.match(header, /Guider/);

    const robots = await app.inject({ method: "GET", url: "/robots.txt" });
    assert.match(robots.body, /Disallow: \/kom-igang/);
    const sitemap = await app.inject({ method: "GET", url: "/sitemap.xml" });
    assert.doesNotMatch(sitemap.body, /kom-igang/);

    const css = await app.inject({ method: "GET", url: "/kom-igang.css" });
    assert.equal(css.statusCode, 200);
    assert.match(css.body, /min-height:\s*3rem/);
    await app.close();
  });

  it("switches the H1 with an allowlisted variant and drops anything else", async () => {
    const app = await createTestApp();
    const b = await app.inject({ method: "GET", url: "/kom-igang?h=b" });
    assert.ok(b.body.includes(`<h1 id="go-h1">${HERO_HEADLINES.b}</h1>`));
    const c = await app.inject({ method: "GET", url: "/kom-igang?h=C" });
    assert.ok(c.body.includes(`<h1 id="go-h1">${HERO_HEADLINES.c}</h1>`));
    const junk = await app.inject({ method: "GET", url: "/kom-igang?h=%3Cscript%3E" });
    assert.ok(junk.body.includes(`<h1 id="go-h1">${HERO_HEADLINES.a}</h1>`));
    assert.doesNotMatch(junk.body, /name="h"/);
    await app.close();
  });

  it("saves an Android notify address without turning it into a beta application", async () => {
    const sent: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
    process.env.RESEND_API_KEY = "test-key";
    const app = await createTestApp();
    const saved = await app.inject({
      method: "POST",
      url: "/kom-igang/android?utm_source=meta&utm_campaign=launch&fbclid=IwAR0testclick&next=https://evil.example",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        email: "Nora@Example.com",
        utm_source: "meta",
        utm_campaign: "launch",
        fbclid: "IwAR0testclick",
      }),
    });
    assert.equal(saved.statusCode, 302);
    assert.match(
      String(saved.headers.location),
      /^\/kom-igang\?utm_source=meta&utm_campaign=launch&fbclid=IwAR0testclick&android=klart&done=[A-Za-z0-9_-]+$/,
    );
    assert.doesNotMatch(String(saved.headers.location), /evil\.example/);

    const row = await getPool().query(
      `SELECT name, email_normalized, role, platform_ios, platform_android, message
       FROM interest_signups`,
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].email_normalized, "nora@example.com");
    assert.equal(row.rows[0].name, "Android-avisering");
    assert.equal(row.rows[0].role, "other");
    assert.equal(row.rows[0].platform_android, true);
    assert.equal(row.rows[0].platform_ios, false);
    assert.match(row.rows[0].message, /Google Play-avisering/);

    assert.equal(sent.length, 2);
    assert.match(sent[0].text, /Vi mejlar när Körpasset finns på Google Play/);
    assert.doesNotMatch(sent[0].text, /automatisk access/);
    assert.doesNotMatch(sent[0].text, /tar in familjer/);

    const thanks = await app.inject({ method: "GET", url: String(saved.headers.location) });
    assert.match(thanks.body, /Klart\. Vi mejlar när Körpasset finns på Google Play\./);
    await app.close();
  });

  it("keeps an existing waitlist name when the same email asks for Android", async () => {
    await saveInterestSignup({
      name: "Nora Nilsson",
      email: "nora@example.com",
      role: "parent",
      platformIos: true,
      platformAndroid: false,
      message: "Redan i kön",
    });
    const app = await createTestApp();
    const saved = await app.inject({
      method: "POST",
      url: "/kom-igang/android",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      payload: formBody({ email: "nora@example.com" }),
    });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.json(), { ok: true, done: saved.json().done });
    assert.match(saved.json().done, /^[A-Za-z0-9_-]+$/);
    const row = await getPool().query(
      `SELECT name, role, platform_ios, platform_android, message FROM interest_signups`,
    );
    assert.equal(row.rows[0].name, "Nora Nilsson");
    assert.equal(row.rows[0].role, "parent");
    assert.equal(row.rows[0].platform_ios, true);
    assert.equal(row.rows[0].platform_android, true);
    assert.match(row.rows[0].message, /Redan i kön/);
    assert.match(row.rows[0].message, /Google Play-avisering/);
    await app.close();
  });

  it("rejects a bad email in text and ignores the honeypot", async () => {
    const app = await createTestApp();
    const bad = await app.inject({
      method: "POST",
      url: "/kom-igang/android",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ email: "inte-en-epost" }),
    });
    assert.equal(bad.statusCode, 400);
    assert.match(bad.body, /role="alert"/);
    assert.match(bad.body, /giltig e-postadress/);
    const empty = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(empty.rows[0].n, 0);

    const bot = await app.inject({
      method: "POST",
      url: "/kom-igang/android",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ email: "bot@example.com", website: "https://spam.example" }),
    });
    assert.equal(bot.statusCode, 302);
    const still = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(still.rows[0].n, 0);
    await app.close();
  });

  it("counts campaign clicks without storing a Meta click id", async () => {
    const app = await createTestApp();
    const saved = await app.inject({
      method: "POST",
      url: "/kom-igang/event",
      headers: { "content-type": "application/json" },
      payload: {
        event: "app_store_click",
        placement: "hero",
        platform: "ios",
        variant: "a",
        utm_source: "meta",
        utm_medium: "paid",
        utm_campaign: "launch",
        utm_content: "video_a",
        fbclid: "IwAR0shouldnotbestored",
      },
    });
    assert.equal(saved.statusCode, 204);
    const row = await getPool().query(`SELECT row_to_json(campaign_events) AS raw FROM campaign_events`);
    assert.equal(row.rowCount, 1);
    const raw = JSON.stringify(row.rows[0].raw);
    assert.match(raw, /app_store_click/);
    assert.match(raw, /"utm_source":"meta"/);
    assert.match(raw, /"placement":"hero"/);
    assert.doesNotMatch(raw, /IwAR0shouldnotbestored/);
    assert.doesNotMatch(raw, /fbclid/);

    const rejected = await app.inject({
      method: "POST",
      url: "/kom-igang/event",
      headers: { "content-type": "application/json" },
      payload: { event: "signup_completed", placement: "hero" },
    });
    assert.equal(rejected.statusCode, 400);
    await app.close();
  });

  it("points Android at Google Play when the listing is live", async () => {
    process.env.ANDROID_PLAY_LIVE = "1";
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/kom-igang" });
    assert.match(page.body, /Hämta på Google Play/);
    assert.ok(page.body.includes(PLAY_STORE_URL));
    assert.doesNotMatch(page.body, /Meddela mig/);
    assert.doesNotMatch(page.body, /data-android-form/);
    await app.close();
  });

  it("does not load campaign or consent scripts inside the native app", async () => {
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: "/kom-igang",
      cookies: { korpasset_native: "1" },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Hämta Körpasset för iPhone/);
    assert.doesNotMatch(page.body, /kom-igang\.js/);
    assert.doesNotMatch(page.body, /consent\.js/);
    assert.doesNotMatch(page.body, /googletagmanager|connect\.facebook\.net|metaPixelId/i);
    await app.close();
  });
});
