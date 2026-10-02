import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { setMailerForTests, type OutboundEmail } from "../src/services/email.js";
import {
  sendStuckHelpEmails,
  type HelpEmailLogger,
  type HelpEmailRunSummary,
} from "../src/services/help-email.js";
import { acceptInvitation, createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-10-02T08:00:00.000Z");

let sent: OutboundEmail[] = [];

function hoursBefore(hours: number, now = NOW): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}

async function setSeen(userId: string, at: Date): Promise<void> {
  await getPool().query(`UPDATE users SET last_seen_at = $2 WHERE id = $1`, [
    userId,
    at.toISOString(),
  ]);
}

async function setContactEmail(userId: string, email: string | null): Promise<void> {
  await getPool().query(
    `UPDATE users
     SET contact_email = $2, contact_email_normalized = $3
     WHERE id = $1`,
    [userId, email, email?.toLowerCase() ?? null],
  );
}

async function quietAccount(name: string, email: string | null, hoursAgo: number) {
  const user = await createGuestUser(name);
  await setSeen(user.id, hoursBefore(hoursAgo));
  if (email) await setContactEmail(user.id, email);
  return user;
}

function logger(): { log: HelpEmailLogger; entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    log: {
      info(obj) {
        entries.push(obj);
      },
      error(obj) {
        entries.push(obj);
      },
    },
  };
}

async function run(
  now = NOW,
  beforeSend?: (accountId: string, type: "no_journey" | "no_connected_supervisor") => Promise<void>,
): Promise<HelpEmailRunSummary & { entries: unknown[] }> {
  const captured = logger();
  const summary = await sendStuckHelpEmails({ now, log: captured.log, beforeSend });
  const dumped = JSON.stringify(captured.entries);
  for (const email of sent) {
    assert.equal(dumped.includes(email.to), false);
  }
  return { ...summary, entries: captured.entries };
}

async function sentRows(): Promise<Array<{ account_id: string; type: string }>> {
  const result = await getPool().query(
    `SELECT account_id, type FROM account_help_emails ORDER BY type, account_id`,
  );
  return result.rows;
}

describe("stuck help emails", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    sent = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
  });

  afterEach(() => {
    setMailerForTests(null);
  });

  it("reports the open app again when the page becomes visible or the native app resumes", async () => {
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/app" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /fetch\("\/api\/client"/);
    assert.match(page.body, /visibilitychange/);
    assert.match(page.body, /appStateChange/);
    await app.close();
  });

  it("sends once when there is no journey, 25h of quiet, and an email", async () => {
    const user = await quietAccount("Nora", "nora@example.com", 25);
    const summary = await run();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "nora@example.com");
    assert.match(sent[0].subject, /komma vidare/);
    assert.match(sent[0].text, /Om du är elev: öppna appen och skapa din körkortsresa/);
    assert.match(sent[0].text, /Om du är handledare: öppna inbjudan från eleven och acceptera den/);
    assert.equal(
      summary.decisions.filter((decision) => decision.action === "sent").length,
      1,
    );
    assert.deepEqual(await sentRows(), [{ account_id: user.id, type: "no_journey" }]);

    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: `/admin/users/${user.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Hjälpmejl/);
    assert.match(page.body, /Tidigt stopp: Ingen resa/);
    assert.match(page.body, /Ingen resa skickades/);
    await app.close();
  });

  it("does not send when the account was active 23 hours ago", async () => {
    await quietAccount("Nora", "nora@example.com", 23);
    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions[0]?.action, "skipped");
    assert.equal(summary.decisions[0]?.reason, "recent_activity");
    assert.deepEqual(await sentRows(), []);
  });

  it("restarts the 24h clock when the app is opened again", async () => {
    const user = await quietAccount("Nora", "nora@example.com", 25);
    await setSeen(user.id, hoursBefore(1));
    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions[0]?.reason, "recent_activity");
  });

  it("does not send the no-journey email after the journey is created at 20 hours", async () => {
    const user = await quietAccount("Nora", "nora@example.com", 20);
    await createJourneyForStudent("Nora", user.id);
    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions[0]?.helpEmailType, "no_connected_supervisor");
    assert.equal(summary.decisions[0]?.reason, "recent_activity");
    assert.deepEqual(await sentRows(), []);
  });

  it("does not send or record a send when the account has no email", async () => {
    const user = await quietAccount("Nora", null, 25);
    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions[0]?.reason, "missing_email");
    assert.deepEqual(await sentRows(), []);

    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: `/admin/users/${user.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.match(page.body, /Tidigt stopp: Ingen resa/);
    assert.match(page.body, /Inget hjälpmejl skickat/);
    await app.close();
  });

  it("does not send a second no-journey email", async () => {
    await quietAccount("Nora", "nora@example.com", 25);
    await run();
    sent = [];
    const again = await run();
    assert.equal(sent.length, 0);
    assert.equal(again.decisions[0]?.reason, "already_sent");
    assert.equal((await sentRows()).length, 1);
  });

  it("mails the journey owner when no supervisor is connected after 25h", async () => {
    const created = await continueWithOAuth({
      provider: "google",
      subject: "owner-google",
      displayName: "Nora",
      email: "nora@example.com",
    });
    await setSeen(created.userId, hoursBefore(25));
    await createJourneyForStudent("Nora", created.userId);
    const summary = await run();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "nora@example.com");
    assert.match(sent[0].subject, /bjuda in din handledare/);
    assert.match(sent[0].text, /ännu ingen ansluten handledare/);
    assert.doesNotMatch(sent[0].text, /skapa din körkortsresa/);
    assert.equal(summary.decisions[0]?.helpEmailType, "no_connected_supervisor");
    assert.deepEqual(await sentRows(), [
      { account_id: created.userId, type: "no_connected_supervisor" },
    ]);
  });

  it("does not send after a supervisor accepts, even when the owner has been quiet for 30h", async () => {
    const owner = await quietAccount("Nora", "nora@example.com", 30);
    const journey = await createJourneyForStudent("Nora", owner.id);
    const supervisor = await quietAccount("Maja", "maja@example.com", 30);
    const invitation = await createInvitation(journey.journey.id, owner.id);
    await acceptInvitation(invitation.token, "Maja", supervisor.id);

    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(
      summary.decisions.find((decision) => decision.accountId === owner.id),
      undefined,
    );
    assert.deepEqual(await sentRows(), []);
  });

  it("does not send when the supervisor accepts after the account was selected", async () => {
    const owner = await quietAccount("Nora", "nora@example.com", 25);
    const journey = await createJourneyForStudent("Nora", owner.id);
    const supervisor = await createGuestUser("Maja");
    const invitation = await createInvitation(journey.journey.id, owner.id);

    const summary = await run(NOW, async (accountId) => {
      if (accountId !== owner.id) return;
      await acceptInvitation(invitation.token, "Maja", supervisor.id);
    });

    assert.equal(sent.length, 0);
    const ownerDecision = summary.decisions.find((decision) => decision.accountId === owner.id);
    assert.equal(ownerDecision?.action, "skipped");
    if (ownerDecision?.action === "skipped") {
      assert.equal(ownerDecision.reason, "stop_resolved");
    }
    assert.deepEqual(await sentRows(), []);
  });

  it("does not send a second no-supervisor email", async () => {
    const owner = await quietAccount("Nora", "nora@example.com", 25);
    await createJourneyForStudent("Nora", owner.id);
    await run();
    sent = [];
    const again = await run();
    assert.equal(sent.length, 0);
    assert.equal(again.decisions[0]?.reason, "already_sent");
    assert.equal(again.decisions[0]?.helpEmailType, "no_connected_supervisor");
  });

  it("sends the supervisor email after a no-journey email once a journey exists and stays quiet", async () => {
    const user = await quietAccount("Nora", "nora@example.com", 25);
    await run();
    assert.deepEqual(
      (await sentRows()).map((row) => row.type),
      ["no_journey"],
    );

    await createJourneyForStudent("Nora", user.id);
    await setSeen(user.id, NOW);
    sent = [];
    const tooSoon = await run();
    assert.equal(sent.length, 0);
    assert.equal(tooSoon.decisions[0]?.reason, "recent_activity");

    await setSeen(user.id, hoursBefore(25));
    const later = await run();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "nora@example.com");
    assert.match(sent[0].text, /bjuda in din handledare/);
    assert.equal(later.decisions[0]?.helpEmailType, "no_connected_supervisor");
    assert.deepEqual(
      (await sentRows()).map((row) => row.type).sort(),
      ["no_connected_supervisor", "no_journey"],
    );
  });

  it("mails two unlinked accounts separately and does not match on name", async () => {
    const student = await quietAccount("Maja Lauterwik", "maja.lauterwik@example.com", 25);
    await createJourneyForStudent("Maja Lauterwik", student.id);
    const supervisor = await quietAccount("Nord Lauterwik", "nord.lauterwik@example.com", 25);

    await run();

    assert.equal(sent.length, 2);
    const toStudent = sent.find((email) => email.to === "maja.lauterwik@example.com");
    const toSupervisor = sent.find((email) => email.to === "nord.lauterwik@example.com");
    assert.ok(toStudent);
    assert.ok(toSupervisor);
    assert.match(toStudent.text, /bjuda in din handledare/);
    assert.doesNotMatch(toStudent.text, /Nord/);
    assert.match(toSupervisor.text, /Om du är elev/);
    assert.match(toSupervisor.text, /Om du är handledare/);
    assert.doesNotMatch(toSupervisor.text, /Maja/);

    const links = await getPool().query(
      `SELECT 1 FROM journey_collaborators WHERE user_id = $1`,
      [supervisor.id],
    );
    assert.equal(links.rowCount, 0);
  });

  it("does not mail a journey that already has a supervisor but no drive", async () => {
    const owner = await quietAccount("Nora", "nora@example.com", 25);
    const journey = await createJourneyForStudent("Nora", owner.id);
    const supervisor = await quietAccount("Maja", "maja@example.com", 25);
    const invitation = await createInvitation(journey.journey.id, owner.id);
    await acceptInvitation(invitation.token, "Maja", supervisor.id);
    await setSeen(owner.id, hoursBefore(25));
    await setSeen(supervisor.id, hoursBefore(25));

    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions.length, 0);
  });

  it("does not mail an inactive account after the first drive is completed", async () => {
    const owner = await quietAccount("Nora", "nora@example.com", 25);
    const journey = await createJourneyForStudent("Nora", owner.id);
    const supervisor = await quietAccount("Maja", "maja@example.com", 25);
    const invitation = await createInvitation(journey.journey.id, owner.id);
    await acceptInvitation(invitation.token, "Maja", supervisor.id);
    await getPool().query(
      `INSERT INTO drives (
         journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at
       )
       VALUES ($1, $2, $3, $4, $4)`,
      [journey.journey.id, owner.id, supervisor.id, hoursBefore(48).toISOString()],
    );
    await setSeen(owner.id, hoursBefore(25));
    await setSeen(supervisor.id, hoursBefore(25));

    const summary = await run();
    assert.equal(sent.length, 0);
    assert.equal(summary.decisions.length, 0);
  });

  it("does not record a send when the provider rejects the email", async () => {
    await quietAccount("Nora", "nora@example.com", 25);
    setMailerForTests({
      async send() {
        throw new Error("provider down");
      },
    });
    const failed = await run();
    assert.equal(failed.decisions.length, 0);
    assert.deepEqual(await sentRows(), []);

    sent = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
    await run();
    assert.equal(sent.length, 1);
    assert.equal((await sentRows()).length, 1);
  });
});
