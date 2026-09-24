import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("public legal pages", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("serves privacy and terms without third-party fonts or ads", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    const terms = await app.inject({ method: "GET", url: "/villkor" });

    assert.equal(privacy.statusCode, 200);
    assert.equal(terms.statusCode, 200);
    assert.equal(privacy.cookies.length, 0);
    assert.equal(terms.cookies.length, 0);
    assert.doesNotMatch(privacy.body, /fonts\.googleapis/);
    assert.doesNotMatch(terms.body, /fonts\.googleapis/);
    assert.doesNotMatch(privacy.body, /gtag|google-analytics|plausible|facebook\.net/i);
    await app.close();
  });

  it("keeps public and in-app links to existing legal routes", async () => {
    const created = await continueWithOAuth({
      provider: "apple",
      subject: "legal-links-apple",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    const account = await injectWithSession(app, session(created.userId), {
      method: "GET",
      url: "/konto",
    });

    for (const page of [home, account]) {
      assert.match(page.body, /href="\/integritet"/);
      assert.match(page.body, /href="\/villkor"/);
    }
    assert.match(home.body, /href="\/radera-konto"/);
    assert.match(account.body, /href="\/radera-konto"/);
    assert.match(account.body, /action="\/konto\/radera"/);

    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    const terms = await app.inject({ method: "GET", url: "/villkor" });
    const deletion = await app.inject({ method: "GET", url: "/radera-konto" });
    assert.equal(privacy.statusCode, 200);
    assert.equal(terms.statusCode, 200);
    assert.equal(deletion.statusCode, 200);
    assert.match(privacy.body, /href="\/radera-konto"/);
    assert.match(terms.body, /href="\/integritet"/);
    assert.match(terms.body, /href="\/radera-konto"/);
    await app.close();
  });

  it("describes waitlist consent, contract basis and actual account deletion", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });

    assert.match(privacy.body, /Papa Bravo AB är personuppgiftsansvarig/);
    assert.match(privacy.body, /info@korpasset\.se/);
    assert.match(privacy.body, /support@korpasset\.se/);
    assert.match(privacy.body, /rättsliga grunden är ditt samtycke/i);
    assert.match(privacy.body, /kryssa i rutan/);
    assert.match(privacy.body, /fullgöra avtalet/);
    assert.match(privacy.body, /Sign in with Apple/);
    assert.match(privacy.body, /Sign in with Google/);
    assert.match(privacy.body, /sub/);
    assert.match(privacy.body, /personnummer/);
    assert.match(privacy.body, /GPS-spår/);
    assert.match(privacy.body, /hälsodata/);
    assert.match(privacy.body, /Resend/);
    assert.match(privacy.body, /utanför EU\/EES/);
    assert.match(privacy.body, /användarraden raderas inte/);
    assert.match(privacy.body, /intresseanmälan till betan raderas inte automatiskt/i);
    assert.match(privacy.body, /utan koppling till ditt konto/);
    assert.match(privacy.body, /Interna produkthändelser kopplas loss/);
    assert.doesNotMatch(privacy.body, /internt användar-id/);
    assert.match(privacy.body, /Säkerhetskopior av databasen kan innehålla personuppgifter en begränsad tid/);
    assert.match(privacy.body, /bara för att återställa tjänsten/);
    assert.match(privacy.body, /inte för vanlig behandling/);
    assert.doesNotMatch(privacy.body, /ingen automatisk rensning av backuper/);
    assert.match(privacy.body, /sätter vi inga cookies/);
    assert.match(privacy.body, /Cookien sätts inte av en vanlig inbjudningslänk/);
    assert.doesNotMatch(privacy.body, /avidentifierar personuppgifter/);
    assert.doesNotMatch(privacy.body, /rättsliga anspråk/);
    await app.close();
  });

  it("keeps terms aligned with the free beta and mandatory consumer law", async () => {
    const app = await createTestApp();
    const terms = await app.inject({ method: "GET", url: "/villkor" });

    assert.match(terms.body, /gratis/);
    assert.match(terms.body, /intresseanmälan innebär inte automatiskt/i);
    assert.match(terms.body, /livslång fri tillgång/);
    assert.match(terms.body, /flera handledare/);
    assert.match(terms.body, /tvingande svensk lag/);
    assert.match(terms.body, /tvingande konsumentlagstiftning/);
    assert.match(terms.body, /Allmänna reklamationsnämnden/);
    assert.match(terms.body, /Transportstyrelsen/);
    assert.doesNotMatch(terms.body, /befintligt skick/);
    assert.doesNotMatch(terms.body, /6\s*\/\s*12\s*\/\s*24/);
    assert.doesNotMatch(terms.body, /Premium/i);
    await app.close();
  });

  it("does not set cookies on the public landing page", async () => {
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.equal(home.cookies.length, 0);
    await app.close();
  });
});
