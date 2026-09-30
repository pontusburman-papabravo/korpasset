import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const TRACKING_LEAK =
  /consent\.js|data-consent-root|Godkänn alla|Cookieinställningar|Cookies på Körpasset|googletagmanager|google-analytics\.com|connect\.facebook\.net|facebook\.com\/tr|fbevents|gaMeasurementId|metaPixelId|Google Analytics|Meta Pixel|G-H275WSBLJ8|1358346629475279/i;

function assertNoTrackingSurface(body: string, label: string): void {
  assert.doesNotMatch(body, TRACKING_LEAK, label);
}

describe("native WebView tracking isolation", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("marks product routes as native and never leaks tracking HTML", async () => {
    process.env.GA_MEASUREMENT_ID = "G-H275WSBLJ8";
    process.env.META_PIXEL_ID = "1358346629475279";
    const created = await continueWithOAuth({
      provider: "apple",
      subject: "native-tracking-apple",
      displayName: "Ella",
    });
    const { journey } = await createJourneyForStudent("Ella", created.userId);
    const invitation = await createInvitation(journey.id, created.userId);
    const app = await createTestApp();
    const session = { bilklar_session: createSessionToken(created.userId) };

    const productPaths = [
      "/app",
      "/onboarding",
      "/konto",
      "/mer",
      "/hjalp",
      `/journey/${journey.id}`,
    ];
    for (const url of productPaths) {
      const page = await injectWithSession(app, session, { method: "GET", url });
      assert.ok(page.statusCode < 400, `${url} status ${page.statusCode}`);
      const native = page.cookies.find((cookie) => cookie.name === "korpasset_native");
      assert.equal(native?.value, "1", `${url} must set korpasset_native`);
      if (typeof page.body === "string" && page.body.includes("<html")) {
        assertNoTrackingSurface(page.body, url);
      }
    }

    const invite = await app.inject({
      method: "GET",
      url: `/invite/${invitation.token}`,
    });
    assert.ok(invite.statusCode < 400, `/invite status ${invite.statusCode}`);
    assert.equal(
      invite.cookies.find((cookie) => cookie.name === "korpasset_native")?.value,
      "1",
    );
    assertNoTrackingSurface(invite.body, "/invite/:token");

    const native = { korpasset_native: "1" };
    for (const url of [
      "/cookies",
      "/integritet",
      "/villkor",
      "/kontakt",
      "/radera-konto",
      "/",
      "/interest/tack",
    ]) {
      const page = await app.inject({ method: "GET", url, cookies: native });
      assert.equal(page.statusCode, 200, url);
      assertNoTrackingSurface(page.body, `${url} with native cookie`);
    }

    const kontoFirst = await injectWithSession(app, session, {
      method: "GET",
      url: "/konto",
    });
    const follow = await app.inject({
      method: "GET",
      url: "/cookies",
      cookies: {
        ...session,
        korpasset_native:
          kontoFirst.cookies.find((cookie) => cookie.name === "korpasset_native")
            ?.value ?? "",
      },
    });
    assertNoTrackingSurface(follow.body, "Konto → Cookies without a prior /app visit");
    assert.match(follow.body, /ingen cookiebanner/);
    assert.match(follow.body, /spårar inte användare/);

    await app.close();
    delete process.env.GA_MEASUREMENT_ID;
    delete process.env.META_PIXEL_ID;
  });

  it("keeps the public website consent surface in a normal browser", async () => {
    process.env.GA_MEASUREMENT_ID = "G-H275WSBLJ8";
    process.env.META_PIXEL_ID = "1358346629475279";
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.match(home.body, /data-consent-root/);
    assert.match(home.body, /Godkänn alla/);
    assert.match(home.body, /consent\.js/);
    assert.match(home.body, /"gaMeasurementId":"G-H275WSBLJ8"/);
    assert.match(home.body, /"metaPixelId":"1358346629475279"/);
    assert.doesNotMatch(home.body, /googletagmanager\.com/);
    assert.doesNotMatch(home.body, /connect\.facebook\.net/);

    const cookies = await app.inject({ method: "GET", url: "/cookies" });
    assert.match(cookies.body, /Google Analytics/);
    assert.match(cookies.body, /Meta Pixel/);
    assert.match(cookies.body, /Cookieinställningar/);
    await app.close();
    delete process.env.GA_MEASUREMENT_ID;
    delete process.env.META_PIXEL_ID;
  });
});
