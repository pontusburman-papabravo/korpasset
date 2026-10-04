import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { deleteProductAccount } from "../src/services/account-lifecycle.js";
import { createAdminUser } from "../src/services/admin-users.js";
import {
  marketingListUnsubscribeHeaders,
  marketingUnsubscribeUrl,
  renderMarketingEmail,
} from "../src/services/marketing-email.js";
import {
  getMarketingEmailPreference,
  issueUnsubscribeToken,
  setMarketingEmailOptIn,
  unsubscribeByToken,
} from "../src/services/marketing-preferences.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { createGuestUser } from "../src/services/users.js";
import { buildWeeklySummaryEmail } from "../src/services/weekly-summary-email.js";
import {
  WEEKLY_SUMMARY_TIME_ZONE,
  type JourneyWeeklySummary,
} from "../src/services/weekly-summary.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

function summary(): JourneyWeeklySummary {
  return {
    journeyId: "00000000-0000-4000-8000-000000000001",
    timeZone: WEEKLY_SUMMARY_TIME_ZONE,
    weekKey: "2026-W40",
    start: "2026-09-27T22:00:00.000Z",
    end: "2026-10-04T22:00:00.000Z",
    completedDrives: 1,
    totalDriveSeconds: 600,
    totalDriveMinutes: 10,
    trainedSkills: 1,
    uniqueTrainedSkills: 1,
    newlyTrainedSkills: 1,
    checkoffSteps: 0,
    completedSkills: 0,
    newlyCompletedSkills: 0,
    progressionStart: 10,
    progressionEnd: 12,
    supervisorsUsed: 1,
    distanceMeters: null,
    topSkills: [],
    firstDriveThisWeek: true,
  };
}

describe("marketing email preferences", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("keeps new accounts and waitlist signups opted out", async () => {
    const user = await createGuestUser("Anna");
    const preference = await getMarketingEmailPreference(user.id);
    assert.equal(preference?.optIn, false);
    assert.equal(preference?.consentAt, null);
    await saveInterestSignup({
      name: "Bo",
      email: "bo@example.com",
      role: "student",
      platformAndroid: true,
    });
    const still = await getMarketingEmailPreference(user.id);
    assert.equal(still?.optIn, false);
  });

  it("records consent and opt-out without moving timestamps on a repeat save", async () => {
    const user = await createGuestUser("Anna");
    const on = await setMarketingEmailOptIn(user.id, true);
    assert.equal(on?.optIn, true);
    assert.ok(on?.consentAt);
    const again = await setMarketingEmailOptIn(user.id, true);
    assert.equal(again?.consentAt, on?.consentAt);
    const off = await setMarketingEmailOptIn(user.id, false);
    assert.equal(off?.optIn, false);
    assert.equal(off?.consentAt, on?.consentAt);
    assert.ok(off?.optOutAt);
    const offAgain = await setMarketingEmailOptIn(user.id, false);
    assert.equal(offAgain?.optOutAt, off?.optOutAt);
  });

  it("turns the account checkbox on and shows the choice to admin", async () => {
    const user = await createGuestUser("Anna");
    const admin = await createAdminUser("ops-news@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const before = await app.inject({
      method: "GET",
      url: "/konto",
      cookies: session(user.id),
    });
    assert.equal(before.statusCode, 200);
    assert.match(before.body, /Jag vill få nyheter, tips och erbjudanden/);
    assert.match(before.body, /produktinformation/);
    assert.doesNotMatch(before.body, /name="marketing_email_opt_in"[^>]*checked/);

    const saved = await app.inject({
      method: "POST",
      url: "/konto/nyheter",
      cookies: session(user.id),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ marketing_email_opt_in: "yes" }),
    });
    assert.equal(saved.statusCode, 302);
    const after = await app.inject({
      method: "GET",
      url: "/konto",
      cookies: session(user.id),
    });
    assert.match(after.body, /name="marketing_email_opt_in" value="yes" checked/);

    const adminPage = await app.inject({
      method: "GET",
      url: `/admin/users/${user.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(adminPage.statusCode, 200);
    assert.match(adminPage.body, /Nyheter: Ja/);
    assert.match(adminPage.body, /produktkommunikation/);
    await app.close();
  });

  it("unsubscribes from a token link and accepts the same link twice", async () => {
    const user = await createGuestUser("Anna");
    await setMarketingEmailOptIn(user.id, true);
    const token = await issueUnsubscribeToken(user.id);
    const url = marketingUnsubscribeUrl(token);
    assert.match(url, /\/avregistrera\//);
    assert.doesNotMatch(url, new RegExp(user.id));
    const headers = marketingListUnsubscribeHeaders(url);
    assert.match(headers["List-Unsubscribe"], new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    const text = renderMarketingEmail({
      heading: "En nyhet",
      body: "Kort text.",
      unsubscribeUrl: url,
    });
    assert.match(text, /Avregistrera dig/);
    assert.match(text, /nyheter från Körpasset/);

    const app = await createTestApp();
    const first = await app.inject({ method: "GET", url: `/avregistrera/${token}` });
    assert.equal(first.statusCode, 200);
    assert.match(first.body, /Du är avregistrerad/);
    assert.match(first.body, /produktinformation/);
    const preference = await getMarketingEmailPreference(user.id);
    assert.equal(preference?.optIn, false);
    const second = await app.inject({
      method: "POST",
      url: `/avregistrera/${token}`,
    });
    assert.equal(second.statusCode, 200);
    const missing = await app.inject({ method: "GET", url: "/avregistrera/not-a-real-token" });
    assert.equal(missing.statusCode, 404);
    assert.equal(await unsubscribeByToken(token), true);
    await app.close();
  });

  it("clears the marketing choice when the account is deleted", async () => {
    const user = await createGuestUser("Anna");
    await setMarketingEmailOptIn(user.id, true);
    await issueUnsubscribeToken(user.id);
    await deleteProductAccount(user.id);
    const preference = await getMarketingEmailPreference(user.id);
    assert.equal(preference?.optIn, false);
    assert.equal(preference?.consentAt, null);
    assert.equal(preference?.optOutAt, null);
  });

  it("leaves the weekly product mail outside the marketing choice", () => {
    const message = buildWeeklySummaryEmail({
      displayName: "Anna",
      summary: summary(),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl: "https://korpasset.se/tips?source=weekly_email",
    });
    assert.doesNotMatch(message.text, /Avregistrera/);
    assert.doesNotMatch(message.text, /List-Unsubscribe/);
    assert.doesNotMatch(message.html, /Avregistrera/);
  });
});
