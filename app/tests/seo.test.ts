import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";
import { PUBLIC_INDEX_PAGES, SITE_DESCRIPTION } from "../src/http/seo.js";

describe("public SEO files and metadata", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("serves robots.txt that points Google to the sitemap and hides private paths", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/robots.txt" });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /text\/plain/);
    assert.match(response.body, /User-agent: \*/);
    assert.match(response.body, /Allow: \//);
    assert.match(response.body, /Disallow: \/admin/);
    assert.match(response.body, /Disallow: \/journey\//);
    assert.match(response.body, /Disallow: \/invite\//);
    assert.match(response.body, /Disallow: \/onboarding/);
    assert.match(response.body, /Disallow: \/app/);
    assert.match(response.body, /Disallow: \/konto/);
    assert.match(response.body, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);
    assert.doesNotMatch(response.body, /Disallow: \/integritet/);
    assert.doesNotMatch(response.body, /Disallow: \/radera-konto/);
    await app.close();
  });

  it("serves sitemap.xml with the public pages Google should index", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/sitemap.xml" });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"]), /xml/);
    assert.match(response.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    for (const page of PUBLIC_INDEX_PAGES) {
      const loc = `http://localhost:3000${page.path === "/" ? "/" : page.path}`;
      assert.match(response.body, new RegExp(`<loc>${loc.replaceAll("/", "\\/")}<\\/loc>`));
    }
    assert.doesNotMatch(response.body, /\/admin/);
    assert.doesNotMatch(response.body, /\/journey\//);
    assert.doesNotMatch(response.body, /\/interest\/tack/);
    await app.close();
  });

  it("gives the homepage a unique title, canonical URL, Twitter cards and FAQ schema", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<title>Körpasset – övningskörning för att ta körkort<\/title>/);
    assert.ok(
      response.body.includes(`<meta name="description" content="${SITE_DESCRIPTION}">`),
    );
    assert.match(response.body, /<meta name="robots" content="index, follow">/);
    assert.match(response.body, /<link rel="canonical" href="http:\/\/localhost:3000\/">/);
    assert.match(response.body, /rel="alternate" hreflang="sv"/);
    assert.match(response.body, /name="twitter:card" content="summary_large_image"/);
    assert.match(response.body, /property="og:locale" content="sv_SE"/);
    assert.match(response.body, /property="og:site_name" content="Körpasset"/);
    assert.match(response.body, /type="application\/ld\+json"/);
    assert.match(response.body, /"@type":"FAQPage"/);
    assert.match(response.body, /"@type":"WebApplication"/);
    assert.match(response.body, /"@type":"Organization"/);
    assert.match(response.body, /Vad är Körpasset\?/);
    await app.close();
  });

  it("puts target search phrases in homepage and contact page content", async () => {
    const phrases = [
      "övningskörning",
      "övningsköra",
      "ta körkort",
      "privat övningskörning",
      "handledare körkort",
      "handledare under övningskörningen",
      "körkort elev",
      "uppkörning",
      "körkortstillstånd",
      "träna inför körkort",
    ];
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    const contact = await app.inject({ method: "GET", url: "/kontakt" });
    const terms = await app.inject({ method: "GET", url: "/villkor" });
    assert.equal(home.statusCode, 200);
    for (const phrase of phrases) {
      assert.match(home.body, new RegExp(phrase, "i"), `homepage missing ${phrase}`);
    }
    assert.match(contact.body, /privat övningskörning/);
    assert.match(contact.body, /ta körkort/);
    assert.match(contact.body, /övningsköra/);
    assert.match(contact.body, /träna inför körkort/);
    assert.match(contact.body, /uppkörning/);
    assert.match(contact.body, /körkortstillstånd/);
    assert.match(contact.body, /handledare under övningskörningen/);
    assert.match(terms.body, /privat övningskörning/);
    assert.match(terms.body, /träna inför körkort/);
    assert.match(terms.body, /uppkörning/);
    await app.close();
  });

  it("gives legal pages unique descriptions and canonical URLs", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    const contact = await app.inject({ method: "GET", url: "/kontakt" });
    const deletion = await app.inject({ method: "GET", url: "/radera-konto" });
    assert.equal(privacy.statusCode, 200);
    assert.match(privacy.body, /<link rel="canonical" href="http:\/\/localhost:3000\/integritet">/);
    assert.match(privacy.body, /personuppgifter/);
    assert.match(privacy.body, /<meta name="robots" content="index, follow">/);
    assert.equal(contact.statusCode, 200);
    assert.match(contact.body, /<link rel="canonical" href="http:\/\/localhost:3000\/kontakt">/);
    assert.match(contact.body, /<meta name="description" content="Kontakta Körpasset/);
    assert.equal(deletion.statusCode, 200);
    assert.match(deletion.body, /<link rel="canonical" href="http:\/\/localhost:3000\/radera-konto">/);
    assert.match(deletion.body, /<meta name="description" content="Radera ditt Körpasset-konto/);
    await app.close();
  });

  it("keeps thank-you and in-app pages out of the index", async () => {
    const app = await createTestApp();
    const thanks = await app.inject({ method: "GET", url: "/interest/tack" });
    assert.match(thanks.body, /<meta name="robots" content="noindex, follow">/);

    const onboarding = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(onboarding.statusCode, 200);
    assert.match(onboarding.body, /<meta name="robots" content="noindex, nofollow">/);
    await app.close();
  });
});
