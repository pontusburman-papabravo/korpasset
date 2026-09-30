import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { deleteProductAccount } from "../src/services/account-lifecycle.js";
import { createAdminUser } from "../src/services/admin-users.js";
import {
  getEmailBroadcast,
  listEmailBroadcasts,
} from "../src/services/email-broadcasts.js";
import { type OutboundEmail, setMailerForTests } from "../src/services/email.js";
import { saveInterestSignup } from "../src/services/interest.js";
import {
  getMarketingEmailPreference,
  issueUnsubscribeToken,
  setMarketingEmailOptIn,
} from "../src/services/marketing-preferences.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const migrationSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations/0019_marketing_email.sql"),
  "utf8",
);

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

async function preference(userId: string) {
  const row = await getPool().query(
    `SELECT marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at, account_state
     FROM users WHERE id = $1`,
    [userId],
  );
  return row.rows[0] as {
    marketing_email_opt_in: boolean;
    marketing_email_consent_at: Date | null;
    marketing_email_opt_out_at: Date | null;
    account_state: string;
  };
}

describe("marketing email preferences and broadcasts", () => {
  const sent: OutboundEmail[] = [];

  beforeEach(async () => {
    await resetDatabaseData();
    sent.length = 0;
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
  });

  afterEach(() => {
    setMailerForTests(null);
  });

  it("gives a new user marketing_email_opt_in false", async () => {
    const guest = await createGuestUser("Ella");
    const oauth = await continueWithOAuth({
      provider: "google",
      subject: "google-new-marketing",
      displayName: "Nora",
      email: "nora@example.com",
    });
    for (const userId of [guest.id, oauth.userId]) {
      const row = await preference(userId);
      assert.equal(row.marketing_email_opt_in, false);
      assert.equal(row.marketing_email_consent_at, null);
      assert.equal(row.marketing_email_opt_out_at, null);
    }
  });

  it("migrates existing users to marketing_email_opt_in false", async () => {
    assert.match(migrationSql, /marketing_email_opt_in boolean NOT NULL DEFAULT false/);
    assert.match(migrationSql, /UPDATE users\s+SET marketing_email_opt_in = false/);
    const column = await getPool().query(
      `SELECT is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'marketing_email_opt_in'`,
    );
    assert.equal(column.rows[0].is_nullable, "NO");
    assert.match(String(column.rows[0].column_default), /false/);

    const inserted = await getPool().query(
      `INSERT INTO users (display_name, account_state)
       VALUES ('Före kolumnen', 'active')
       RETURNING marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at`,
    );
    assert.equal(inserted.rows[0].marketing_email_opt_in, false);
    assert.equal(inserted.rows[0].marketing_email_consent_at, null);
    assert.equal(inserted.rows[0].marketing_email_opt_out_at, null);
  });

  it("lets the user opt in and records marketing_email_consent_at", async () => {
    const user = await continueWithOAuth({
      provider: "apple",
      subject: "apple-opt-in",
      displayName: "Ella",
      email: "ella@example.com",
    });
    const app = await createTestApp();
    const saved = await injectWithSession(app, session(user.userId), {
      method: "POST",
      url: "/konto/kommunikation",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ marketing_email_opt_in: "yes" }),
    });
    assert.equal(saved.statusCode, 302);
    const row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, true);
    assert.ok(row.marketing_email_consent_at);
    assert.equal(row.marketing_email_opt_out_at, null);
    assert.equal(row.account_state, "active");
    await app.close();
  });

  it("lets the user opt out and records marketing_email_opt_out_at", async () => {
    const user = await continueWithOAuth({
      provider: "google",
      subject: "google-opt-out",
      displayName: "Omar",
      email: "omar@example.com",
    });
    await setMarketingEmailOptIn(user.userId, true);
    await getPool().query(
      `UPDATE users SET marketing_email_consent_at = '2020-01-01T00:00:00Z' WHERE id = $1`,
      [user.userId],
    );
    const app = await createTestApp();
    const saved = await injectWithSession(app, session(user.userId), {
      method: "POST",
      url: "/konto/kommunikation",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({}),
    });
    assert.equal(saved.statusCode, 302);
    const row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, false);
    assert.ok(row.marketing_email_opt_out_at);
    assert.equal(new Date(row.marketing_email_consent_at!).toISOString(), "2020-01-01T00:00:00.000Z");
    await app.close();
  });

  it("shows the preference on Konto, off by default", async () => {
    const user = await continueWithOAuth({
      provider: "google",
      subject: "google-konto-ui",
      displayName: "Ella",
      email: "ella-ui@example.com",
    });
    const app = await createTestApp();
    const page = await injectWithSession(app, session(user.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Kommunikation/);
    assert.match(
      page.body,
      /Jag vill få nyheter, tips och erbjudanden från Körpasset via e-post\./,
    );
    assert.match(page.body, /Du kan ändra detta när som helst\./);
    assert.match(page.body, /name="marketing_email_opt_in"/);
    assert.doesNotMatch(page.body, /checked/);

    await setMarketingEmailOptIn(user.userId, true);
    const optedIn = await injectWithSession(app, session(user.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(optedIn.body, /name="marketing_email_opt_in"[^>]*checked/);
    await app.close();
  });

  it("shows the preference in admin", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const yes = await continueWithOAuth({
      provider: "google",
      subject: "google-admin-yes",
      displayName: "Ja Person",
      email: "ja@example.com",
    });
    const no = await continueWithOAuth({
      provider: "apple",
      subject: "apple-admin-no",
      displayName: "Nej Person",
      email: "nej@example.com",
    });
    await setMarketingEmailOptIn(yes.userId, true);
    await setMarketingEmailOptIn(no.userId, true);
    await setMarketingEmailOptIn(no.userId, false);
    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };

    const list = await app.inject({ method: "GET", url: "/admin/users?state=all", cookies });
    assert.match(list.body, /Nyheter: Ja/);
    assert.match(list.body, /Nyheter: Nej/);

    const yesPage = await app.inject({
      method: "GET",
      url: `/admin/users/${yes.userId}`,
      cookies,
    });
    assert.match(yesPage.body, /Nyheter via e-post: Ja/);
    assert.match(yesPage.body, /Tackade ja: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    assert.doesNotMatch(yesPage.body, /Tackade nej:/);

    const noPage = await app.inject({
      method: "GET",
      url: `/admin/users/${no.userId}`,
      cookies,
    });
    assert.match(noPage.body, /Nyheter via e-post: Nej/);
    assert.match(noPage.body, /Tackade nej: \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    assert.doesNotMatch(noPage.body, /Tackade ja:/);
    await app.close();
  });

  it("does not treat a waitlist signup as marketing consent", async () => {
    const user = await continueWithOAuth({
      provider: "google",
      subject: "google-waitlist",
      displayName: "Beta",
      email: "beta-person@example.com",
    });
    await saveInterestSignup({
      name: "Beta",
      email: "beta-person@example.com",
      role: "parent",
      platformIos: true,
    });
    const column = await getPool().query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'interest_signups' AND column_name = 'marketing_email_opt_in'`,
    );
    assert.equal(column.rowCount, 0);
    const row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, false);
    assert.equal(row.marketing_email_consent_at, null);
  });

  it("sends marketing only to opted-in users with a usable email and skips opt-outs", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const optedIn = await continueWithOAuth({
      provider: "google",
      subject: "google-mail-yes",
      displayName: "Ja",
      email: "yes-mail@example.com",
    });
    const optedOut = await continueWithOAuth({
      provider: "google",
      subject: "google-mail-no",
      displayName: "Nej",
      email: "no-mail@example.com",
    });
    const noEmail = await createGuestUser("Utan post");
    await setMarketingEmailOptIn(optedIn.userId, true);
    await setMarketingEmailOptIn(optedOut.userId, true);
    await setMarketingEmailOptIn(optedOut.userId, false);
    await setMarketingEmailOptIn(noEmail.id, true);
    await getPool().query(
      `UPDATE users SET created_at = '2026-01-01T00:00:00Z' WHERE id = $1`,
      [optedIn.userId],
    );
    await getPool().query(
      `UPDATE users SET created_at = '2026-01-02T00:00:00Z' WHERE id = $1`,
      [optedOut.userId],
    );

    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    const fields = {
      intent: "send",
      kind: "marketing",
      subject: "Nyhet från Körpasset",
      heading: "En nyhet",
      body: "Texten i nyhetsbrevet.",
      include_opted_out: "yes",
    };
    const created = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody(fields),
    });
    assert.equal(created.statusCode, 302);
    const draftId = String(created.headers.location).split("/").at(-2);
    const confirm = await app.inject({
      method: "GET",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.match(confirm.body, /Skicka detta mejl till 1 mottagare\?/);
    assert.match(confirm.body, /Mottagare: 1 person/);

    sent.length = 0;
    const sentResponse = await app.inject({
      method: "POST",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.equal(sentResponse.statusCode, 302);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "yes-mail@example.com");
    assert.equal(sent[0].subject, "Nyhet från Körpasset");
    assert.match(sent[0].text, /Du får detta eftersom du har valt att få nyheter från Körpasset\./);
    assert.match(sent[0].text, /Vill du inte få fler nyheter från Körpasset\? Avregistrera dig här\./);
    assert.match(sent[0].text, /Avregistrera dig: /);
    assert.match(sent[0].text, /Körpasset · Papa Bravo AB/);
    assert.match(sent[0].text, /\/avregistrera\//);
    assert.equal(sent[0].text.includes(optedIn.userId), false);
    assert.equal(sent[0].text.toLowerCase().includes("yes-mail@example.com"), false);
    assert.equal(sent[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(sent[0].headers?.["List-Unsubscribe"] ?? "", /^<https?:\/\/.+\/avregistrera\/[^>]+>$/);
    const stored = await getEmailBroadcast(String(draftId));
    assert.equal(stored?.status, "sent");
    assert.equal(stored?.recipientCount, 1);
    await app.close();
  });

  it("respects an opt-out between preview and the actual send", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const first = await continueWithOAuth({
      provider: "google",
      subject: "google-race-1",
      displayName: "Ett",
      email: "first@example.com",
    });
    const second = await continueWithOAuth({
      provider: "apple",
      subject: "apple-race-2",
      displayName: "Två",
      email: "second@example.com",
    });
    await setMarketingEmailOptIn(first.userId, true);
    await setMarketingEmailOptIn(second.userId, true);
    await getPool().query(`UPDATE users SET created_at = '2026-02-01T00:00:00Z' WHERE id = $1`, [
      first.userId,
    ]);
    await getPool().query(`UPDATE users SET created_at = '2026-02-02T00:00:00Z' WHERE id = $1`, [
      second.userId,
    ]);

    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    const created = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        intent: "save",
        kind: "marketing",
        subject: "Båda",
        heading: "Rubrik",
        body: "Bröd.",
      }),
    });
    const draftId = String(created.headers.location).split("/").at(-1)?.split("?")[0];
    const draftPage = await app.inject({
      method: "GET",
      url: `/admin/utskick/${draftId}`,
      cookies,
    });
    assert.match(draftPage.body, /Mottagare: 2 personer/);

    await setMarketingEmailOptIn(second.userId, false);
    sent.length = 0;
    setMailerForTests({
      async send(email) {
        sent.push(email);
        if (sent.length === 1) {
          await setMarketingEmailOptIn(second.userId, false);
        }
      },
    });
    const confirm = await app.inject({
      method: "GET",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.match(confirm.body, /Skicka detta mejl till 1 mottagare\?/);
    const sentResponse = await app.inject({
      method: "POST",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.equal(sentResponse.statusCode, 302);
    assert.deepEqual(sent.map((email) => email.to), ["first@example.com"]);
    const stored = await getEmailBroadcast(String(draftId));
    assert.equal(stored?.recipientCount, 1);
    await app.close();
  });

  it("drops a recipient who opts out while the send is in progress", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const first = await continueWithOAuth({
      provider: "google",
      subject: "google-live-1",
      displayName: "Ett",
      email: "live-first@example.com",
    });
    const second = await continueWithOAuth({
      provider: "google",
      subject: "google-live-2",
      displayName: "Två",
      email: "live-second@example.com",
    });
    await setMarketingEmailOptIn(first.userId, true);
    await setMarketingEmailOptIn(second.userId, true);
    await getPool().query(`UPDATE users SET created_at = '2026-03-01T00:00:00Z' WHERE id = $1`, [
      first.userId,
    ]);
    await getPool().query(`UPDATE users SET created_at = '2026-03-02T00:00:00Z' WHERE id = $1`, [
      second.userId,
    ]);
    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    sent.length = 0;
    setMailerForTests({
      async send(email) {
        sent.push(email);
        await setMarketingEmailOptIn(second.userId, false);
      },
    });
    const created = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        intent: "send",
        kind: "marketing",
        subject: "Live",
        heading: "Rubrik",
        body: "Bröd.",
      }),
    });
    const draftId = String(created.headers.location).split("/").at(-2);
    const sentResponse = await app.inject({
      method: "POST",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.equal(sentResponse.statusCode, 302);
    assert.deepEqual(sent.map((email) => email.to), ["live-first@example.com"]);
    await app.close();
  });

  it("sends service mail to opted-out users and omits the unsubscribe footer", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const user = await continueWithOAuth({
      provider: "apple",
      subject: "apple-service",
      displayName: "Tjänst",
      email: "service@example.com",
    });
    await setMarketingEmailOptIn(user.userId, false);
    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    const created = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        intent: "send",
        kind: "service",
        subject: "Driftinformation",
        heading: "Kort avbrott",
        body: "Tjänsten är tillbaka i kväll.",
      }),
    });
    const draftId = String(created.headers.location).split("/").at(-2);
    sent.length = 0;
    const sentResponse = await app.inject({
      method: "POST",
      url: `/admin/utskick/${draftId}/bekrafta`,
      cookies,
    });
    assert.equal(sentResponse.statusCode, 302);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "service@example.com");
    assert.equal(sent[0].headers, undefined);
    assert.doesNotMatch(sent[0].text, /Avregistrera/);
    assert.doesNotMatch(sent[0].text, /Du får detta eftersom du har valt att få nyheter/);
    const row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, false);
    await app.close();
  });

  it("unsubscribes from the link without a login, repeatedly", async () => {
    const user = await continueWithOAuth({
      provider: "google",
      subject: "google-unsub",
      displayName: "Länk",
      email: "link@example.com",
    });
    await setMarketingEmailOptIn(user.userId, true);
    const token = await issueUnsubscribeToken(user.userId);
    assert.equal(token.includes(user.userId), false);
    assert.equal(token.toLowerCase().includes("link@example.com"), false);
    const app = await createTestApp();
    const first = await app.inject({ method: "GET", url: `/avregistrera/${token}` });
    assert.equal(first.statusCode, 200);
    assert.match(first.body, /Du är avregistrerad/);
    assert.match(first.body, /Du kommer inte längre att få nyheter och erbjudanden från Körpasset\./);
    assert.match(first.body, /Du kan ändra detta igen under Konto i Körpasset\./);
    assert.doesNotMatch(first.body, /consent\.js|googletagmanager|facebook\.com\/tr/);
    let row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, false);
    assert.ok(row.marketing_email_opt_out_at);
    assert.equal(row.account_state, "active");

    await getPool().query(
      `UPDATE users SET marketing_email_opt_out_at = '2020-05-05T00:00:00Z' WHERE id = $1`,
      [user.userId],
    );
    const second = await app.inject({ method: "GET", url: `/avregistrera/${token}` });
    assert.equal(second.statusCode, 200);
    assert.match(second.body, /Du är avregistrerad/);
    const third = await app.inject({ method: "POST", url: `/avregistrera/${token}` });
    assert.equal(third.statusCode, 200);
    row = await preference(user.userId);
    assert.equal(row.marketing_email_opt_in, false);
    assert.equal(new Date(row.marketing_email_opt_out_at!).toISOString(), "2020-05-05T00:00:00.000Z");

    const missing = await app.inject({ method: "GET", url: "/avregistrera/inte-en-giltig-token-alls" });
    assert.equal(missing.statusCode, 404);
    assert.doesNotMatch(missing.body, /Du är avregistrerad/);
    await app.close();
  });

  it("keeps a test send out of the broadcast history", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    const fields = {
      kind: "marketing",
      subject: "Testämne",
      heading: "Testrubrik",
      body: "Testbröd.",
    };
    sent.length = 0;
    const preview = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ ...fields, intent: "preview" }),
    });
    assert.equal(preview.statusCode, 200);
    assert.match(preview.body, /Förhandsgranskning/);
    assert.match(preview.body, /Avregistrera dig/);
    assert.equal(sent.length, 0);
    assert.equal((await listEmailBroadcasts()).length, 0);

    const testSend = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ ...fields, intent: "test" }),
    });
    assert.equal(testSend.statusCode, 200);
    assert.match(testSend.body, /Testmejl skickat till dig/);
    assert.equal((await listEmailBroadcasts()).length, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "ops@korpasset.se");
    assert.equal(sent[0].subject, "[Test] Testämne");
    assert.match(sent[0].text, /Det här är ett testutskick/);
    assert.match(sent[0].text, /Avregistrera dig/);

    const saved = await app.inject({
      method: "POST",
      url: "/admin/utskick",
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ ...fields, intent: "save" }),
    });
    const draftId = String(saved.headers.location).split("/").at(-1)?.split("?")[0];
    sent.length = 0;
    const testDraft = await app.inject({
      method: "POST",
      url: `/admin/utskick/${draftId}`,
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ ...fields, intent: "test" }),
    });
    assert.equal(testDraft.statusCode, 200);
    const draft = await getEmailBroadcast(String(draftId));
    assert.equal(draft?.status, "draft");
    assert.equal(draft?.sentAt, null);
    assert.equal(draft?.recipientCount, null);
    assert.equal(draft?.subject, "Testämne");
    assert.equal((await listEmailBroadcasts()).length, 1);

    const list = await app.inject({ method: "GET", url: "/admin/utskick", cookies });
    assert.match(list.body, /Nytt utskick/);
    assert.match(list.body, /Utkast/);
    assert.match(list.body, /Nyheter \/ marknadsföring/);
    await app.close();
  });

  it("leaves Apple and Google login unchanged when the preference changes", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-login-stable",
      displayName: "Apple",
      email: "apple-login@example.com",
    });
    const appleAgain = await continueWithOAuth({
      provider: "apple",
      subject: "apple-login-stable",
      displayName: "Annat namn",
      email: "apple-login@example.com",
    });
    assert.equal(appleAgain.userId, apple.userId);
    assert.equal(appleAgain.created, false);
    assert.equal((await getMarketingEmailPreference(apple.userId))?.optIn, false);

    await setMarketingEmailOptIn(apple.userId, true);
    const appleAfter = await continueWithOAuth({
      provider: "apple",
      subject: "apple-login-stable",
      email: "apple-login@example.com",
    });
    assert.equal(appleAfter.userId, apple.userId);
    assert.equal((await getMarketingEmailPreference(apple.userId))?.optIn, true);

    const google = await continueWithOAuth({
      provider: "google",
      subject: "google-login-stable",
      displayName: "Google",
      email: "google-login@example.com",
    });
    const googleAgain = await continueWithOAuth({
      provider: "google",
      subject: "google-login-stable",
      email: "google-login@example.com",
    });
    assert.equal(googleAgain.userId, google.userId);
    assert.equal(googleAgain.created, false);
    assert.equal((await getMarketingEmailPreference(google.userId))?.optIn, false);
  });

  it("clears marketing data when the account is deleted", async () => {
    const user = await continueWithOAuth({
      provider: "google",
      subject: "google-delete-marketing",
      displayName: "Bort",
      email: "bort@example.com",
    });
    await setMarketingEmailOptIn(user.userId, true);
    await issueUnsubscribeToken(user.userId);
    await deleteProductAccount(user.userId);
    const row = await preference(user.userId);
    assert.equal(row.account_state, "deleted");
    assert.equal(row.marketing_email_opt_in, false);
    assert.equal(row.marketing_email_consent_at, null);
    assert.equal(row.marketing_email_opt_out_at, null);
    const tokens = await getPool().query(
      `SELECT count(*)::int AS count FROM marketing_unsubscribe_tokens WHERE user_id = $1`,
      [user.userId],
    );
    assert.equal(tokens.rows[0].count, 0);
    const identities = await getPool().query(
      `SELECT count(*)::int AS count FROM auth_identities WHERE user_id = $1`,
      [user.userId],
    );
    assert.equal(identities.rows[0].count, 0);
  });
});
