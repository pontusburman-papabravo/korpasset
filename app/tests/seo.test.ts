import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";
import { publicGuideMeta } from "../src/http/guide-content.js";
import { PUBLIC_INDEX_PAGES, SITE_DESCRIPTION, robotsTxt, sitemapXml } from "../src/http/seo.js";

function jsonLd(html: string): { "@graph"?: Record<string, unknown>[] } {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing json-ld");
  return JSON.parse(match[1]) as { "@graph"?: Record<string, unknown>[] };
}

function graphNodes(data: { "@graph"?: Record<string, unknown>[] }): Record<string, unknown>[] {
  return data["@graph"] ?? [];
}

function metaContent(html: string, attr: "name" | "property", key: string): string {
  const pattern = new RegExp(
    `<meta ${attr}="${key}" content="([^"]*)"`,
  );
  const match = html.match(pattern);
  assert.ok(match, `missing meta ${key}`);
  return match[1];
}

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
    assert.match(response.body, /Disallow: \/guide/);
    assert.match(response.body, /Disallow: \/resa/);
    assert.match(response.body, /Disallow: \/mer/);
    assert.match(response.body, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);
    assert.doesNotMatch(response.body, /Disallow: \/integritet/);
    assert.doesNotMatch(response.body, /Disallow: \/radera-konto/);
    assert.doesNotMatch(response.body, /Disallow: \/ovningskora/);
    assert.doesNotMatch(response.body, /Disallow: \/ovningskorning/);
    assert.doesNotMatch(response.body, /Disallow: \/planera-ovningskorning/);
    assert.doesNotMatch(response.body, /Disallow: \/handledare/);
    assert.doesNotMatch(response.body, /Disallow: \/\*\.css/);
    assert.doesNotMatch(response.body, /Disallow: \/\*\.js/);
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
    assert.doesNotMatch(response.body, /<loc>[^<]*\/app<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/guide\/[^<]*<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/guide<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/resa<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/onboarding<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/konto<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\/hjalp<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/ovningskorning<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/ovningskora-med-passagerare<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/ovningskora-med-foralder<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/planera-ovningskorning<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/handledare<\/loc>/);
    assert.match(response.body, /<loc>http:\/\/localhost:3000\/ovningskora\/rondell<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>http:\/\/localhost:3000\/ovningskora<\/loc>/);
    assert.doesNotMatch(response.body, /<loc>[^<]*\?/);
    assert.doesNotMatch(response.body, /<lastmod>/);
    for (const guide of publicGuideMeta()) {
      assert.match(response.body, new RegExp(`<loc>http:\\/\\/localhost:3000${guide.path.replaceAll("/", "\\/")}<\\/loc>`));
    }
    await app.close();
  });

  it("gives the homepage a unique title, canonical URL, Twitter cards and app schema", async () => {
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
    assert.doesNotMatch(response.body, /"@type":"FAQPage"/);
    assert.match(response.body, /"@type":"SoftwareApplication"/);
    assert.doesNotMatch(response.body, /"@type":"WebApplication"/);
    assert.match(response.body, /"@type":"Organization"/);
    const homeLd = jsonLd(response.body);
    const appNode = graphNodes(homeLd).find((node) => node["@type"] === "SoftwareApplication");
    assert.ok(appNode);
    assert.equal(appNode.name, "Körpasset");
    assert.equal(appNode.operatingSystem, "iOS");
    assert.equal(appNode.applicationCategory, "EducationalApplication");
    assert.match(String(appNode.description), /övningskörning/);
    assert.equal(appNode.downloadUrl, "https://apps.apple.com/se/app/korpasset/id6814100094");
    assert.equal(graphNodes(homeLd).filter((node) => node["@type"] === "SoftwareApplication").length, 1);
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
    assert.match(terms.body, /träna vidare/);
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
    const appEntry = await app.inject({ method: "GET", url: "/app" });
    assert.equal(appEntry.statusCode, 200);
    assert.match(appEntry.body, /<meta name="robots" content="noindex, nofollow">/);
    await app.close();
  });

  it("publishes unique, indexable practice guides with article schema", async () => {
    const app = await createTestApp();
    const pages = publicGuideMeta();
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    titles.add(home.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    descriptions.add(metaContent(home.body, "name", "description"));
    assert.match(home.body, /href="\/ovningskorning"/);
    assert.match(home.body, /href="\/handledare"/);
    assert.match(home.body, /href="\/ovningskora-med-foralder"/);
    assert.match(home.body, /Guider för övningskörning/);
    assert.equal(home.body.match(/<h1[\s>]/g)?.length, 1);

    for (const page of pages) {
      const response = await app.inject({ method: "GET", url: page.path });
      assert.equal(response.statusCode, 200, page.path);
      assert.equal(response.headers.location, undefined, page.path);
      assert.match(response.body, /<meta name="robots" content="index, follow">/);
      assert.doesNotMatch(response.body, /noindex/);
      assert.match(
        response.body,
        new RegExp(`<link rel="canonical" href="http:\\/\\/localhost:3000${page.path.replaceAll("/", "\\/")}">`),
      );
      assert.match(
        response.body,
        new RegExp(`<meta property="og:url" content="http:\\/\\/localhost:3000${page.path.replaceAll("/", "\\/")}">`),
      );
      assert.match(response.body, /property="og:title"/);
      assert.match(response.body, /property="og:description"/);
      assert.match(response.body, /property="og:type" content="article"/);
      assert.match(response.body, /name="twitter:card" content="summary_large_image"/);
      assert.match(response.body, /name="twitter:title"/);
      assert.match(response.body, /name="twitter:description"/);

      const title = response.body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      assert.equal(title, page.documentTitle, page.path);
      assert.equal(titles.has(title), false, `duplicate title ${title}`);
      titles.add(title);

      const description = metaContent(response.body, "name", "description");
      assert.equal(description, page.description, page.path);
      assert.equal(descriptions.has(description), false, `duplicate description on ${page.path}`);
      descriptions.add(description);
      assert.equal(metaContent(response.body, "property", "og:description"), description);
      assert.equal(metaContent(response.body, "name", "twitter:description"), description);

      const h1s = response.body.match(/<h1[\s>]/g) ?? [];
      assert.equal(h1s.length, 1, page.path);
      assert.ok(response.body.includes(`<h1>${page.h1}</h1>`), page.path);
      assert.equal(response.body.match(/rel="canonical"/g)?.length, 1, page.path);
      assert.equal(response.body.match(/application\/ld\+json/g)?.length, 1, page.path);

      const data = jsonLd(response.body);
      const nodes = graphNodes(data);
      const types = nodes.map((node) => node["@type"]);
      assert.equal(types.filter((type) => type === "Article").length, 1, page.path);
      assert.equal(types.filter((type) => type === "BreadcrumbList").length, 1, page.path);
      assert.equal(types.includes("FAQPage"), false, page.path);
      assert.equal(types.includes("SoftwareApplication"), false, page.path);
      const article = nodes.find((node) => node["@type"] === "Article");
      assert.equal(article?.headline, page.h1);
      const crumbs = nodes.find((node) => node["@type"] === "BreadcrumbList");
      const items = crumbs?.itemListElement as Array<{ item: string }>;
      assert.ok(items.some((item) => item.item === `http://localhost:3000${page.path}`));
      assert.match(response.body, /href="\/#intresse"/);
    }

    const hub = await app.inject({ method: "GET", url: "/ovningskorning" });
    for (const page of pages) {
      if (page.path === "/ovningskorning") continue;
      assert.match(hub.body, new RegExp(`href="${page.path}"`), page.path);
    }
    assert.match(hub.body, /transportstyrelsen\.se/);
    assert.match(hub.body, /inte Transportstyrelsens tjänst/);
    assert.match(hub.body, /1 augusti 2026/);
    assert.match(hub.body, /fyllt 24/);

    const supervisor = await app.inject({ method: "GET", url: "/handledare" });
    assert.match(supervisor.body, /href="\/ovningskorning"/);
    assert.match(supervisor.body, /transportstyrelsen\.se/);
    assert.match(supervisor.body, /fyllt 24 år/);
    assert.match(supervisor.body, /fem av de senaste tio åren/);
    assert.match(supervisor.body, /fem år/);

    const roundabout = await app.inject({ method: "GET", url: "/ovningskora/rondell" });
    assert.match(roundabout.body, /href="\/ovningskorning"/);
    assert.match(roundabout.body, /href="\/ovningskora\/hogerregeln"/);
    assert.match(roundabout.body, /href="\/ovningskora\/landsvag"/);
    assert.match(roundabout.body, /href="\/planera-ovningskorning"/);
    assert.doesNotMatch(roundabout.body, /<script src="\/app-oauth\.js"/);

    const passenger = await app.inject({ method: "GET", url: "/ovningskora-med-passagerare" });
    const answerAt = passenger.body.indexOf("Ja. Transportstyrelsen skriver");
    const rulesAt = passenger.body.indexOf("Vad reglerna säger");
    assert.ok(answerAt > 0 && answerAt < rulesAt);
    assert.match(passenger.body, /href="\/ovningskorning"/);
    assert.match(passenger.body, /href="\/handledare"/);
    assert.match(passenger.body, /href="\/ovningskora-med-foralder"/);

    const parent = await app.inject({ method: "GET", url: "/ovningskora-med-foralder" });
    assert.match(parent.body, /href="\/ovningskorning"/);
    assert.match(parent.body, /href="\/handledare"/);
    assert.match(parent.body, /href="\/planera-ovningskorning"/);
    assert.match(parent.body, /href="\/ovningskora\/forsta-gangen"/);
    assert.match(parent.body, /Försäkring/);
    assert.match(parent.body, /Fråga bolaget/);

    const legacy = await app.inject({ method: "GET", url: "/ovningskora" });
    assert.equal(legacy.statusCode, 301);
    assert.equal(legacy.headers.location, "/ovningskorning");
    const legacySlash = await app.inject({ method: "GET", url: "/ovningskora/" });
    assert.equal(legacySlash.statusCode, 301);
    assert.equal(legacySlash.headers.location, "/ovningskorning");
    const alias = await app.inject({ method: "GET", url: "/handledare-ovningskorning" });
    assert.equal(alias.statusCode, 301);
    assert.equal(alias.headers.location, "/handledare");
    const hubSlash = await app.inject({ method: "GET", url: "/ovningskorning/" });
    assert.equal(hubSlash.statusCode, 301);
    assert.equal(hubSlash.headers.location, "/ovningskorning");

    await assertLocalLinks(app, hub.body, "/ovningskorning");
    await assertLocalLinks(app, passenger.body, "/ovningskora-med-passagerare");
    await assertLocalLinks(app, parent.body, "/ovningskora-med-foralder");
    await assertLocalLinks(app, supervisor.body, "/handledare");

    await app.close();
  });

  it("uses the production https origin in sitemap and robots when configured", () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://korpasset.se";
    try {
      const xml = sitemapXml();
      assert.match(xml, /<loc>https:\/\/korpasset\.se\/ovningskorning<\/loc>/);
      assert.match(xml, /<loc>https:\/\/korpasset\.se\/ovningskora\/forsta-gangen<\/loc>/);
      assert.doesNotMatch(xml, /<loc>http:\/\//);
      assert.doesNotMatch(xml, /<loc>[^<]*\?/);
      assert.doesNotMatch(xml, /<loc>[^<]*\/admin/);
      assert.doesNotMatch(xml, /<loc>[^<]*\/app</);
      assert.doesNotMatch(xml, /www\.korpasset\.se/);
      const robots = robotsTxt();
      assert.match(robots, /Sitemap: https:\/\/korpasset\.se\/sitemap\.xml/);
      assert.match(robots, /Allow: \//);
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
    }
  });
});

async function assertLocalLinks(
  app: { inject: (opts: { method: string; url: string }) => Promise<{ statusCode: number }> },
  html: string,
  from: string,
): Promise<void> {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set<string>();
  for (const href of hrefs) {
    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
      continue;
    }
    const path = href.split("#")[0] || "/";
    if (path === "" || seen.has(path)) continue;
    seen.add(path);
    const response = await app.inject({ method: "GET", url: path });
    assert.equal(response.statusCode, 200, `${from} -> ${path} (${response.statusCode})`);
  }
}
