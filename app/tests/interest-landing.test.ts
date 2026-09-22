import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import {
  type OutboundEmail,
  setMailerForTests,
} from "../src/services/email.js";
import {
  saveInterestSignup,
  updateInterestSignup,
} from "../src/services/interest.js";
import { TRANSPORTSTYRELSEN_LINKS } from "../src/http/landing.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("landing and interest waitlist", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  afterEach(() => {
    setMailerForTests(null);
    delete process.env.RESEND_API_KEY;
  });

  it("serves the marketing homepage to anonymous visitors", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Övningskörning med bättre koll/);
    assert.match(response.body, /Bli betatestare/);
    assert.match(response.body, /0 av 25 platser fyllda/);
    assert.match(response.body, /Ska du övningsköra privat/);
    assert.match(response.body, /En handledarguide som kommer ihåg/);
    assert.match(response.body, /bok i handskfacket/);
    assert.match(response.body, /action="\/interest"/);
    assert.match(response.body, /name="platform_ios"/);
    assert.match(response.body, /name="platform_android"/);
    assert.match(response.body, /Vi använder/);
    assert.match(response.body, /minst en, båda går bra/);
    assert.match(response.body, /integritetspolicyn/);
    assert.match(response.body, /Vi söker just nu våra första 25/);
    assert.match(response.body, /oavsett om ni just börjat eller redan kört ett år/);
    assert.match(response.body, /Mamma, pappa, syskon/);
    assert.match(response.body, /Vi har redan övningskört ett tag/);
    assert.match(response.body, /tips på nästa steg/);
    assert.match(response.body, /dotter 16, just börjat/);
    assert.doesNotMatch(response.body, /elev \+ mamma och pappa, kört i tre månader/);
    assert.doesNotMatch(response.body, /fonts\.googleapis/);
    await app.close();
  });

  it("uses locked brand assets, favicon and Open Graph tags on the homepage", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);

    const header = response.body.match(/<header class="site-nav">[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.match(header, /src="\/brand\/korpasset-logo\.svg"/);
    assert.match(header, /alt="Körpasset"/);
    assert.doesNotMatch(header, /korpasset-logo-tagline/);
    assert.doesNotMatch(header, /ÖVNING IDAG/);
    assert.doesNotMatch(header, /korpasset-social-1024/);
    assert.doesNotMatch(header, /korpasset-social-dark-1024/);

    assert.match(response.body, /ÖVNING IDAG\. FRIHET IMORGON\./);
    assert.match(response.body, /<h1>Övningskörning med bättre koll<\/h1>/);
    assert.match(response.body, /rel="icon"[^>]*href="\/brand\/favicon\.svg"/);
    assert.match(response.body, /property="og:title"/);
    assert.match(response.body, /property="og:description"/);
    assert.match(response.body, /property="og:image"[^>]*korpasset-og-1200x630\.png/);
    assert.match(response.body, /property="og:url"[^>]*http:\/\/localhost:3000\//);
    assert.match(response.body, /property="og:type" content="website"/);
    assert.match(response.body, /<link rel="canonical" href="http:\/\/localhost:3000\/">/);

    const logo = await app.inject({ method: "GET", url: "/brand/korpasset-logo.svg" });
    const favicon = await app.inject({ method: "GET", url: "/brand/favicon.svg" });
    const ogImage = await app.inject({ method: "GET", url: "/brand/korpasset-og-1200x630.png" });
    assert.equal(logo.statusCode, 200);
    assert.equal(favicon.statusCode, 200);
    assert.equal(ogImage.statusCode, 200);
    await app.close();
  });

  it("shows local traffic photos on the marketing homepage", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    const header = response.body.match(/<header class="site-nav">[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.doesNotMatch(header, /\/images\/landing\//);
    assert.match(response.body, /aria-label="Svensk övningskörning"/);
    assert.match(response.body, /src="\/images\/landing\/roundabout\.jpg"/);
    assert.match(response.body, /src="\/images\/landing\/residential-street\.jpg"/);
    assert.match(response.body, /src="\/images\/landing\/country-road\.jpg"/);

    for (const path of [
      "/images/landing/roundabout.jpg",
      "/images/landing/residential-street.jpg",
      "/images/landing/country-road.jpg",
    ]) {
      const asset = await app.inject({ method: "GET", url: path });
      assert.equal(asset.statusCode, 200, path);
      assert.match(String(asset.headers["content-type"]), /image\/jpeg/);
    }
    await app.close();
  });

  it("keeps product onboarding available", async () => {
    const app = await createTestApp();
    const onboarding = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(onboarding.statusCode, 200);
    assert.match(onboarding.body, /Starta min körkortsresa/);
    assert.match(onboarding.body, /mamma, pappa eller den som kör med er/);
    await app.close();
  });

  it("publishes legal pages", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    const terms = await app.inject({ method: "GET", url: "/villkor" });
    const contact = await app.inject({ method: "GET", url: "/kontakt" });
    const deletion = await app.inject({ method: "GET", url: "/radera-konto" });
    assert.equal(privacy.statusCode, 200);
    assert.match(privacy.body, /personuppgiftsansvarig/i);
    assert.match(privacy.body, /href="\/radera-konto"/);
    assert.equal(terms.statusCode, 200);
    assert.match(terms.body, /gratis/i);
    assert.equal(contact.statusCode, 200);
    assert.match(contact.body, /info@korpasset\.se/);
    assert.match(contact.body, /href="\/radera-konto"/);
    assert.doesNotMatch(privacy.body, /fonts\.googleapis/);
    assert.equal(deletion.statusCode, 200);
    assert.match(deletion.body, /Radera ditt Körpasset-konto/);
    assert.match(deletion.body, /Papa Bravo AB/);
    assert.match(deletion.body, /mailto:support@korpasset\.se/);
    assert.match(deletion.body, /Vad som raderas/);
    assert.match(deletion.body, /Vad som behålls/);
    assert.match(deletion.body, /Du behöver inte ha appen installerad/);
    assert.match(deletion.body, /Radera mitt konto/);
    assert.match(deletion.body, /intresseanmälan/i);
    assert.match(deletion.body, /href="\/radera-konto"/);
    await app.close();
  });

  it("stores an interest signup and thanks the visitor", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Anna Andersson",
        email: "Anna@Example.com",
        role: "parent",
        platform_ios: "yes",
        city: "Uppsala",
        message: "Elev + två handledare",
        consent: "yes",
      }),
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/interest/tack");

    const thanks = await app.inject({ method: "GET", url: "/interest/tack" });
    assert.match(thanks.body, /Tack — vi hör av oss/);
    assert.match(thanks.body, /bekräftelse till din mejladress/);

    const rows = await getPool().query(
      `SELECT name, email, email_normalized, role, city, message, platform_ios, platform_android, status
       FROM interest_signups`,
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].email_normalized, "anna@example.com");
    assert.equal(rows.rows[0].role, "parent");
    assert.equal(rows.rows[0].platform_ios, true);
    assert.equal(rows.rows[0].platform_android, false);
    assert.equal(rows.rows[0].status, "new");
    await app.close();
  });

  it("accepts both iPhone and Android when selected", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Familjen Svensson",
        email: "familjen@example.com",
        role: "parent",
        platform_ios: "yes",
        platform_android: "yes",
        consent: "yes",
      }),
    });
    assert.equal(response.statusCode, 302);

    const rows = await getPool().query(
      `SELECT platform_ios, platform_android FROM interest_signups WHERE email_normalized = $1`,
      ["familjen@example.com"],
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].platform_ios, true);
    assert.equal(rows.rows[0].platform_android, true);
    await app.close();
  });

  it("requires at least one platform choice", async () => {
    const app = await createTestApp();
    const missingPlatform = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Anna",
        email: "anna@example.com",
        role: "parent",
        consent: "yes",
      }),
    });
    assert.equal(missingPlatform.statusCode, 400);
    assert.match(missingPlatform.body, /Kryssa i minst en: iPhone, Android eller båda/);

    const count = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(count.rows[0].n, 0);
    await app.close();
  });

  it("requires consent and a valid email", async () => {
    const app = await createTestApp();
    const missingConsent = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Anna",
        email: "anna@example.com",
        role: "parent",
        platform_ios: "yes",
        consent: "",
      }),
    });
    assert.equal(missingConsent.statusCode, 400);
    assert.match(missingConsent.body, /Bekräfta att du vill bli kontaktad/);

    const badEmail = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Anna",
        email: "inte-en-epost",
        role: "parent",
        platform_ios: "yes",
        consent: "yes",
      }),
    });
    assert.equal(badEmail.statusCode, 400);
    assert.match(badEmail.body, /giltig e-postadress/);

    const count = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(count.rows[0].n, 0);
    await app.close();
  });

  it("updates an existing email instead of creating a duplicate", async () => {
    const app = await createTestApp();
    const payload = {
      name: "Anna",
      email: "anna@example.com",
      role: "parent",
      platform_android: "yes",
      consent: "yes",
    };
    await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody(payload),
    });
    const second = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        ...payload,
        name: "Anna A",
        role: "supervisor",
        platform_ios: "yes",
        city: "Lund",
      }),
    });
    assert.equal(second.statusCode, 302);
    const rows = await getPool().query(`SELECT name, role, city FROM interest_signups`);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].name, "Anna A");
    assert.equal(rows.rows[0].role, "supervisor");
    assert.equal(rows.rows[0].city, "Lund");
    await app.close();
  });

  it("ignores honeypot spam without storing a row", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Bot",
        email: "bot@example.com",
        role: "other",
        platform_ios: "yes",
        website: "https://spam.test",
        consent: "yes",
      }),
    });
    assert.equal(response.statusCode, 302);
    const count = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(count.rows[0].n, 0);
    await app.close();
  });

  it("shows waitlist progress from unique rows and ignores declined", async () => {
    for (let i = 0; i < 3; i += 1) {
      await saveInterestSignup({
        name: `Familj ${i}`,
        email: `familj${i}@example.com`,
        role: "parent",
        platformIos: true,
      });
    }
    const declined = await saveInterestSignup({
      name: "Avböjd",
      email: "avbojd@example.com",
      role: "other",
      platformAndroid: true,
    });
    assert.ok(declined);
    await updateInterestSignup(declined.signup.id, { status: "declined" });

    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /3 av 25 platser fyllda/);
    assert.doesNotMatch(home.body, /4 av 25/);
    await app.close();
  });

  it("caps the public counter at 25 and keeps the waitlist form", async () => {
    for (let i = 0; i < 26; i += 1) {
      await saveInterestSignup({
        name: `Person ${i}`,
        email: `person${i}@example.com`,
        role: "student",
        platformIos: true,
      });
    }
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.match(home.body, /Första betagruppen är fylld/);
    assert.match(home.body, /action="\/interest"/);
    assert.doesNotMatch(home.body, /26 av 25/);
    assert.match(home.body, /aria-valuenow="25"/);
    await app.close();
  });

  it("links official driving rules only to transportstyrelsen.se", async () => {
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    for (const href of Object.values(TRANSPORTSTYRELSEN_LINKS)) {
      assert.match(home.body, new RegExp(href.replaceAll("/", "\\/")));
    }
    const externals = [...home.body.matchAll(/<a [^>]*href="(https?:[^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.ok(externals.length >= 5);
    for (const href of externals) {
      assert.match(href, /^https:\/\/www\.transportstyrelsen\.se\//);
    }
    await app.close();
  });

  it("emails the applicant and support when a new waitlist row is created", async () => {
    const sent: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
    process.env.RESEND_API_KEY = "test-resend";
    const app = await createTestApp();
    const first = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Mia",
        email: "mia@example.com",
        role: "parent",
        platform_ios: "yes",
        city: "Härnösand",
        message: "Vill ha tips på nästa steg",
        consent: "yes",
      }),
    });
    assert.equal(first.statusCode, 302);
    assert.equal(sent.length, 2);
    assert.equal(sent[0]?.to, "mia@example.com");
    assert.match(sent[0]?.subject ?? "", /Tack/);
    assert.match(sent[0]?.text ?? "", /när det är er tur/);
    assert.equal(sent[1]?.to, "support@korpasset.se");
    assert.match(sent[1]?.subject ?? "", /Mia/);
    assert.match(sent[1]?.text ?? "", /Vill ha tips på nästa steg/);
    assert.match(sent[1]?.text ?? "", /Härnösand/);

    sent.length = 0;
    const again = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Mia",
        email: "mia@example.com",
        role: "parent",
        platform_ios: "yes",
        consent: "yes",
      }),
    });
    assert.equal(again.statusCode, 302);
    assert.equal(sent.length, 0);
    await app.close();
  });
});
