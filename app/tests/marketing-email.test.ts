import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { deleteProductAccount } from "../src/services/account-lifecycle.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { getPool } from "../src/db/pool.js";
import { setMailerForTests, type OutboundEmail } from "../src/services/email.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  MARKETING_MAIL_CATEGORY,
  marketingListUnsubscribeHeaders,
  marketingUnsubscribeUrl,
  prepareMarketingEmail,
  renderMarketingEmail,
} from "../src/services/marketing-email.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import {
  WEEKLY_SUMMARY_MAIL_CATEGORY,
  sendWeeklySummaryEmails,
} from "../src/services/weekly-summary-mail.js";
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
  stockholmCivil,
  stockholmWeekContaining,
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

    const adminBefore = await app.inject({
      method: "GET",
      url: `/admin/users/${user.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(adminBefore.statusCode, 200);
    assert.match(adminBefore.body, /Nyheter: Nej/);

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
    assert.match(adminPage.body, /Samtycke:/);
    assert.match(adminPage.body, /Avslut:/);
    assert.match(adminPage.body, /produktkommunikation/);

    const turnedOff = await app.inject({
      method: "POST",
      url: "/konto/nyheter",
      cookies: session(user.id),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({}),
    });
    assert.equal(turnedOff.statusCode, 302);
    const offPage = await app.inject({
      method: "GET",
      url: "/konto",
      cookies: session(user.id),
    });
    assert.doesNotMatch(offPage.body, /name="marketing_email_opt_in"[^>]*checked/);
    const adminOff = await app.inject({
      method: "GET",
      url: `/admin/users/${user.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.match(adminOff.body, /Nyheter: Nej/);
    assert.match(adminOff.body, /Avslut:/);
    assert.doesNotMatch(adminOff.body, /Avslut: —/);
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
    assert.equal(WEEKLY_SUMMARY_MAIL_CATEGORY, "product");
    assert.equal(MARKETING_MAIL_CATEGORY, "marketing");
  });

  it("stores false for a row that omits the marketing columns", async () => {
    const column = await getPool().query(
      `SELECT column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = 'marketing_email_opt_in'`,
    );
    assert.equal(column.rows[0].is_nullable, "NO");
    assert.match(String(column.rows[0].column_default), /false/);
    const inserted = await getPool().query(
      `INSERT INTO users (display_name, account_state)
       VALUES ('Legacy', 'active')
       RETURNING marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at`,
    );
    assert.equal(inserted.rows[0].marketing_email_opt_in, false);
    assert.equal(inserted.rows[0].marketing_email_consent_at, null);
    assert.equal(inserted.rows[0].marketing_email_opt_out_at, null);
  });

  it("does not opt in an Apple or Google login", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-subject-1",
      displayName: "Apple",
      email: "apple@example.com",
    });
    const google = await continueWithOAuth({
      provider: "google",
      subject: "google-subject-1",
      displayName: "Google",
      email: "google@example.com",
    });
    assert.equal((await getMarketingEmailPreference(apple.userId))?.optIn, false);
    assert.equal((await getMarketingEmailPreference(google.userId))?.optIn, false);
    assert.equal(await prepareMarketingEmail(draftInput(apple.userId)), null);
    assert.equal(await prepareMarketingEmail(draftInput(google.userId)), null);
  });

  it("blocks a marketing draft for opt-out, a missing address, and a deleted account", async () => {
    const calls: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        calls.push(email);
        return { id: "should-not-send" };
      },
    });
    try {
      const optedOut = await createGuestUser("Utan");
      await setContactEmail(optedOut.id, "utan@example.com");
      assert.equal(await prepareMarketingEmail(draftInput(optedOut.id)), null);

      await setMarketingEmailOptIn(optedOut.id, true);
      await setMarketingEmailOptIn(optedOut.id, false);
      assert.equal(await prepareMarketingEmail(draftInput(optedOut.id)), null);

      const noAddress = await createGuestUser("Adresslös");
      await setMarketingEmailOptIn(noAddress.id, true);
      assert.equal(await prepareMarketingEmail(draftInput(noAddress.id)), null);

      const paused = await createGuestUser("Paus");
      await setContactEmail(paused.id, "paus@example.com");
      await setMarketingEmailOptIn(paused.id, true);
      await getPool().query(`UPDATE users SET account_state = 'suspended' WHERE id = $1`, [
        paused.id,
      ]);
      assert.equal(await prepareMarketingEmail(draftInput(paused.id)), null);

      const removed = await createGuestUser("Borta");
      await setContactEmail(removed.id, "borta@example.com");
      await setMarketingEmailOptIn(removed.id, true);
      await deleteProductAccount(removed.id);
      assert.equal(await prepareMarketingEmail(draftInput(removed.id)), null);
      const state = await getPool().query(`SELECT account_state FROM users WHERE id = $1`, [
        removed.id,
      ]);
      assert.equal(state.rows[0].account_state, "deleted");
      assert.equal(calls.length, 0);
    } finally {
      setMailerForTests(null);
    }
  });

  it("prepares a marketing draft for an opted-in account without sending it", async () => {
    const calls: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        calls.push(email);
        return { id: "should-not-send" };
      },
    });
    try {
      const user = await createGuestUser("Ja");
      await setContactEmail(user.id, "ja@example.com");
      await setMarketingEmailOptIn(user.id, true);
      const draft = await prepareMarketingEmail(draftInput(user.id));
      assert.ok(draft);
      assert.equal(draft.category, "marketing");
      assert.equal(draft.to, "ja@example.com");
      assert.match(draft.text, /Avregistrera dig/);
      assert.match(draft.text, /Körpasset · Papa Bravo AB/);
      assert.match(draft.headers["List-Unsubscribe"] ?? "", /\/avregistrera\//);
      assert.equal(draft.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
      assert.doesNotMatch(draft.headers["List-Unsubscribe"] ?? "", new RegExp(user.id));
      assert.equal(calls.length, 0);
    } finally {
      setMailerForTests(null);
    }
  });

  it("accepts one-click unsubscribe twice and leaves the account in place", async () => {
    const user = await createGuestUser("Klick");
    await setContactEmail(user.id, "klick@example.com");
    await setMarketingEmailOptIn(user.id, true);
    const token = await issueUnsubscribeToken(user.id);
    const app = await createTestApp();
    const first = await app.inject({
      method: "POST",
      url: `/avregistrera/${token}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    assert.equal(first.statusCode, 200);
    assert.match(first.body, /Du är avregistrerad/);
    assert.doesNotMatch(first.body, /klick@example.com/);
    assert.doesNotMatch(first.body, new RegExp(user.id));
    const second = await app.inject({
      method: "POST",
      url: `/avregistrera/${token}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    assert.equal(second.statusCode, 200);
    const preference = await getMarketingEmailPreference(user.id);
    assert.equal(preference?.optIn, false);
    assert.ok(preference?.optOutAt);
    const row = await getPool().query(
      `SELECT account_state, display_name, contact_email FROM users WHERE id = $1`,
      [user.id],
    );
    assert.equal(row.rows[0].account_state, "guest");
    assert.equal(row.rows[0].display_name, "Klick");
    assert.equal(row.rows[0].contact_email, "klick@example.com");
    assert.equal(await prepareMarketingEmail(draftInput(user.id)), null);
    await app.close();
  });

  it("still sends the weekly product mail when marketing opt-in is off or on", async () => {
    const sent: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
        return { id: "weekly-test" };
      },
    });
    try {
      const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
      const week = await stockholmWeekContaining(sunday);
      const ended = new Date(week.start.getTime() + 2 * 60 * 60 * 1000);
      const optedOut = await createJourneyForStudent("Utan nyheter");
      const optedIn = await createJourneyForStudent("Med nyheter");
      await setContactEmail(optedOut.userId, "utan-vecka@example.com");
      await setContactEmail(optedIn.userId, "med-vecka@example.com");
      await setMarketingEmailOptIn(optedIn.userId, true);
      await insertCompletedDrive(optedOut.journey.id, optedOut.userId, week.start, ended);
      await insertCompletedDrive(optedIn.journey.id, optedIn.userId, week.start, ended);

      const run = await sendWeeklySummaryEmails({ now: sunday });
      assert.equal(run.skippedWindow, false);
      assert.equal(sent.length, 2);
      const recipients = sent.map((email) => email.to).sort();
      assert.deepEqual(recipients, ["med-vecka@example.com", "utan-vecka@example.com"]);
      for (const email of sent) {
        assert.equal(email.headers, undefined);
        assert.doesNotMatch(email.text, /Avregistrera/);
        assert.doesNotMatch(email.text, /List-Unsubscribe/);
      }
      assert.equal(WEEKLY_SUMMARY_MAIL_CATEGORY, "product");
    } finally {
      setMailerForTests(null);
    }
  });
});

function draftInput(userId: string) {
  return {
    userId,
    subject: "En nyhet",
    heading: "En nyhet",
    body: "Kort text.",
  };
}

async function setContactEmail(userId: string, email: string): Promise<void> {
  await getPool().query(
    `UPDATE users
     SET contact_email = $2, contact_email_normalized = $3
     WHERE id = $1`,
    [userId, email, email.toLowerCase()],
  );
}

async function insertCompletedDrive(
  journeyId: string,
  actorId: string,
  startedAt: Date,
  endedAt: Date,
): Promise<void> {
  await getPool().query(
    `INSERT INTO drives (
       journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at
     )
     VALUES ($1, $2, $2, $3, $4)`,
    [journeyId, actorId, startedAt, endedAt],
  );
}
