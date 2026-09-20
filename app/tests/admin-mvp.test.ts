import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { getAdminBetaStats } from "../src/services/admin-stats.js";
import { saveInterestSignup, updateInterestSignup } from "../src/services/interest.js";
import { createInvitation, acceptInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const ADMIN_EMAIL = "ops@korpasset.se";
const ADMIN_PASSWORD = "korrekt-losen-12";

async function seedAdmin() {
  return createAdminUser(ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function skillId(): Promise<string> {
  const skill = await getPool().query(`SELECT id FROM skills ORDER BY skill_key LIMIT 1`);
  return skill.rows[0].id as string;
}

async function seedRatedDrive(options: {
  studentName?: string;
  supervisorName?: string;
  extraSupervisor?: boolean;
  secondDriveHoursLater?: number;
  firstEndedAtSql?: string;
} = {}) {
  const student = await createJourneyForStudent(options.studentName ?? "Ella");
  const invitation = await createInvitation(student.journey.id, student.userId);
  const supervisor = await acceptInvitation(invitation.token, options.supervisorName ?? "Pappa", null);
  const focusSkill = await skillId();

  async function insertRatedDrive(endedAtSql: string, observerId: string) {
    const drive = await getPool().query(
      `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at)
       VALUES ($1, $2, $3, ${endedAtSql} - interval '40 minutes', ${endedAtSql})
       RETURNING id`,
      [student.journey.id, student.userId, observerId],
    );
    const driveId = drive.rows[0].id as string;
    await getPool().query(
      `INSERT INTO drive_focus_skills (drive_id, journey_id, skill_id)
       VALUES ($1, $2, $3)`,
      [driveId, student.journey.id, focusSkill],
    );
    await getPool().query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id, source_type, assessment
       )
       VALUES ($1, $2, $3, $4, 'supervisor', 'with_support')`,
      [student.journey.id, driveId, focusSkill, observerId],
    );
    return driveId;
  }

  const firstEnded = options.firstEndedAtSql ?? "now() - interval '2 days'";
  const firstDriveId = await insertRatedDrive(firstEnded, supervisor.userId);

  let extraSupervisorId: string | undefined;
  if (options.extraSupervisor) {
    const extraInvite = await createInvitation(student.journey.id, student.userId);
    const extra = await acceptInvitation(extraInvite.token, "Mamma", null);
    extraSupervisorId = extra.userId;
  }

  let secondDriveId: string | undefined;
  if (options.secondDriveHoursLater != null) {
    const hours = options.secondDriveHoursLater;
    secondDriveId = await insertRatedDrive(
      `(${firstEnded}) + interval '${hours} hours'`,
      extraSupervisorId ?? supervisor.userId,
    );
  }

  return {
    journeyId: student.journey.id,
    studentId: student.userId,
    supervisorId: supervisor.userId,
    extraSupervisorId,
    firstDriveId,
    secondDriveId,
    skillId: focusSkill,
  };
}

describe("admin MVP v1", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("protects overview, statistik and support with the same admin auth", async () => {
    const app = await createTestApp();
    for (const url of ["/admin", "/admin/statistik", "/admin/support"]) {
      const hidden = await app.inject({ method: "GET", url });
      assert.equal(hidden.statusCode, 404);
    }
    await app.close();

    const admin = await seedAdmin();
    const authed = await createTestApp();
    for (const url of ["/admin", "/admin/statistik", "/admin/support"]) {
      const anon = await authed.inject({ method: "GET", url });
      assert.equal(anon.statusCode, 302);
      assert.equal(anon.headers.location, "/admin/login");
    }
    const token = createAdminToken(admin.id);
    const overview = await authed.inject({
      method: "GET",
      url: "/admin",
      cookies: { korpasset_admin: token },
    });
    assert.equal(overview.statusCode, 200);
    assert.match(overview.body, /Översikt/);
    assert.match(overview.body, /Intresseanmälningar/);
    assert.match(overview.body, /Statistik/);
    assert.match(overview.body, /href="\/admin"/);
    assert.match(overview.body, /href="\/admin\/signups"/);
    assert.match(overview.body, /href="\/admin\/statistik"/);
    assert.doesNotMatch(
      overview.body,
      /<nav class="site-nav__links site-nav__links--admin"[^>]*>[\s\S]*href="\/admin\/support"/,
    );
    assert.doesNotMatch(overview.body, />Tjänster</);
    assert.doesNotMatch(overview.body, />Orders</);

    const statistik = await authed.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { korpasset_admin: token },
    });
    assert.equal(statistik.statusCode, 200);
    assert.match(statistik.body, /Beta-funnel/);
    assert.match(statistik.body, /Canonical observationer/);
    await authed.close();
  });

  it("paginates waitlist at 50 rows and CSV-exports the full filter", async () => {
    const admin = await seedAdmin();
    for (let i = 0; i < 52; i += 1) {
      const saved = await saveInterestSignup({
        name: `Person ${String(i).padStart(2, "0")}`,
        email: `person${i}@example.com`,
        role: "parent",
        platformIos: true,
      });
      assert.ok(saved);
      await getPool().query(
        `UPDATE interest_signups SET created_at = now() - ($2::int * interval '1 minute') WHERE id = $1`,
        [saved.signup.id, 52 - i],
      );
      if (i < 3) {
        await updateInterestSignup(saved.signup.id, { status: "contacted" });
      }
    }

    const app = await createTestApp();
    const token = createAdminToken(admin.id);
    const page1 = await app.inject({
      method: "GET",
      url: "/admin/signups",
      cookies: { korpasset_admin: token },
    });
    assert.equal(page1.statusCode, 200);
    assert.match(page1.body, /1–50 av 52/);
    assert.match(page1.body, /sida 1 av 2/);
    assert.match(page1.body, /person51@example.com/);
    assert.doesNotMatch(page1.body, /person0@example.com/);

    const page2 = await app.inject({
      method: "GET",
      url: "/admin/signups?page=2",
      cookies: { korpasset_admin: token },
    });
    assert.match(page2.body, /51–52 av 52/);
    assert.match(page2.body, /person0@example.com/);
    assert.match(page2.body, /person1@example.com/);

    const csvAll = await app.inject({
      method: "GET",
      url: "/admin/signups.csv",
      cookies: { korpasset_admin: token },
    });
    assert.equal(csvAll.statusCode, 200);
    const csvLines = csvAll.body.trim().split("\n");
    assert.equal(csvLines.length, 53);

    const csvContacted = await app.inject({
      method: "GET",
      url: "/admin/signups.csv?status=contacted",
      cookies: { korpasset_admin: token },
    });
    const contactedLines = csvContacted.body.trim().split("\n");
    assert.equal(contactedLines.length, 4);
    assert.match(csvContacted.body, /contacted/);
    assert.doesNotMatch(csvContacted.body, /,new,/);
    await app.close();
  });

  it("computes beta stats from locked domain definitions, including superseded observations", async () => {
    const active = await seedRatedDrive({
      extraSupervisor: true,
      secondDriveHoursLater: 24,
    });
    await seedRatedDrive({ studentName: "Nova", supervisorName: "Mamma" });
    await createJourneyForStudent("Ingen handledare");

    const original = await getPool().query(
      `SELECT id FROM drive_observations
       WHERE drive_id = $1 AND journey_id = $2
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
      [active.firstDriveId, active.journeyId],
    );
    await getPool().query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id, source_type, assessment,
         supersedes_observation_id
       )
       VALUES ($1, $2, $3, $4, 'supervisor', 'independent', $5)`,
      [active.journeyId, active.firstDriveId, active.skillId, active.supervisorId, original.rows[0].id],
    );

    await getPool().query(
      `INSERT INTO resend_webhook_events (event_type, email_id, svix_id)
       VALUES ('email.bounced', 'email_1', 'svix_bounce')`,
    );

    const stats = await getAdminBetaStats();
    assert.equal(stats.activeJourneys, 2);
    assert.equal(stats.betaGateTarget, 25);
    assert.equal(stats.firstDriveCompletion.completedCoreLoop, 2);
    assert.equal(stats.secondDriveRate.withFirstRatedDrive, 2);
    assert.equal(stats.secondDriveRate.withSecondWithin14d, 1);
    assert.equal(stats.multiSupervisorJourneys, 1);
    assert.equal(stats.drivesOpen, 0);
    assert.ok(stats.drivesCreated30d >= 3);
    assert.equal(stats.canonicalObservations, 3);
    assert.equal(stats.emailBounces24h, 1);
    assert.equal(stats.funnel.journeyCreated, 3);
    assert.equal(stats.funnel.supervisorConnected, 2);
    assert.equal(stats.funnel.secondDriveCompleted, 1);
    assert.equal(stats.drivesCreatedPerDay.length, 30);
    assert.equal(stats.drivesCompletedPerDay.length, 30);

    const originalStillThere = await getPool().query(
      `SELECT count(*)::int AS n FROM drive_observations WHERE id = $1`,
      [original.rows[0].id],
    );
    assert.equal(originalStillThere.rows[0].n, 1);
  });

  it("searches waitlist and product users and keeps support read-only", async () => {
    const admin = await seedAdmin();
    await saveInterestSignup({
      name: "Björn",
      email: "bjorn@example.com",
      role: "student",
      platformAndroid: true,
    });
    const seeded = await seedRatedDrive();
    await getPool().query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject)
       VALUES ($1, 'email_magic_link', 'pappa@example.com')`,
      [seeded.supervisorId],
    );

    const app = await createTestApp();
    const token = createAdminToken(admin.id);

    const waitlist = await app.inject({
      method: "GET",
      url: "/admin/support?q=bjorn@example.com",
      cookies: { korpasset_admin: token },
    });
    assert.equal(waitlist.statusCode, 200);
    assert.match(waitlist.body, /En träff/);
    assert.match(waitlist.body, /Waitlist/);
    assert.match(waitlist.body, /bjorn@example.com/);

    const byUuid = await app.inject({
      method: "GET",
      url: `/admin/support?q=${seeded.supervisorId}`,
      cookies: { korpasset_admin: token },
    });
    assert.match(byUuid.body, /Produktanvändare/);
    assert.match(byUuid.body, /Pappa/);

    const byIdentity = await app.inject({
      method: "GET",
      url: "/admin/support?q=pappa@example.com",
      cookies: { korpasset_admin: token },
    });
    assert.match(byIdentity.body, /inloggningsidentitet/);

    const byName = await app.inject({
      method: "GET",
      url: "/admin/support?q=Pappa",
      cookies: { korpasset_admin: token },
    });
    assert.match(byName.body, /svagt uppslag/);

    const empty = await app.inject({
      method: "GET",
      url: "/admin/support?q=finns-inte@example.com",
      cookies: { korpasset_admin: token },
    });
    assert.match(empty.body, /Ingen träff/);

    const both = await saveInterestSignup({
      name: "Pappa waitlist",
      email: "pappa@example.com",
      role: "supervisor",
      platformIos: true,
    });
    assert.ok(both);
    const mixed = await app.inject({
      method: "GET",
      url: "/admin/support?q=pappa@example.com",
      cookies: { korpasset_admin: token },
    });
    assert.match(mixed.body, /waitlist och produktanvändare/);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/support/users/${seeded.supervisorId}`,
      cookies: { korpasset_admin: token },
    });
    assert.equal(detail.statusCode, 200);
    assert.match(detail.body, /Pappa/);
    assert.match(detail.body, /Handledare/);
    assert.doesNotMatch(detail.body, /name="assessment/);
    assert.doesNotMatch(detail.body, /<textarea/);
    await app.close();
  });

  it("runs GDPR via privileged lifecycle with confirmation and audit, without touching waitlist", async () => {
    const admin = await seedAdmin();
    const seeded = await seedRatedDrive();
    await getPool().query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject)
       VALUES ($1, 'email_magic_link', 'pappa@example.com')`,
      [seeded.supervisorId],
    );
    await saveInterestSignup({
      name: "Pappa",
      email: "pappa@example.com",
      role: "supervisor",
      platformIos: true,
    });
    await getPool().query(
      `UPDATE drive_observations SET note = 'privat anteckning' WHERE drive_id = $1`,
      [seeded.firstDriveId],
    );

    const app = await createTestApp();
    const token = createAdminToken(admin.id);

    const missing = await app.inject({
      method: "POST",
      url: `/admin/support/users/${seeded.supervisorId}/delete-account`,
      cookies: { korpasset_admin: token },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm_irreversible: "yes", confirm_user_id: "wrong" }),
    });
    assert.equal(missing.statusCode, 400);

    const deleted = await app.inject({
      method: "POST",
      url: `/admin/support/users/${seeded.supervisorId}/delete-account`,
      cookies: { korpasset_admin: token },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        confirm_irreversible: "yes",
        confirm_user_id: seeded.supervisorId,
      }),
    });
    assert.equal(deleted.statusCode, 302);

    const user = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(user.rows[0].account_state, "deleted");
    assert.equal(user.rows[0].display_name, null);

    const waitlist = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(waitlist.rows[0].n, 1);

    const observation = await getPool().query(
      `SELECT observer_user_id, note FROM drive_observations WHERE drive_id = $1`,
      [seeded.firstDriveId],
    );
    assert.equal(observation.rows[0].observer_user_id, seeded.supervisorId);
    assert.equal(observation.rows[0].note, "privat anteckning");

    const audit = await getPool().query(
      `SELECT operation, target_id, summary FROM admin_audit_events ORDER BY created_at DESC LIMIT 1`,
    );
    assert.equal(audit.rows[0].operation, "gdpr_delete_account");
    assert.equal(audit.rows[0].target_id, seeded.supervisorId);
    assert.match(audit.rows[0].summary, /waitlist_orörd=true/);
    assert.match(audit.rows[0].summary, /user_id_pseudonymiserad=true/);

    const tombstoneView = await app.inject({
      method: "GET",
      url: `/admin/support/users/${seeded.supervisorId}`,
      cookies: { korpasset_admin: token },
    });
    assert.match(tombstoneView.body, /Tidigare handledare/);
    assert.doesNotMatch(tombstoneView.body, />Pappa</);

    const leftover = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(seeded.supervisorId) },
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ny elev" }),
      },
    );
    assert.equal(leftover.statusCode, 302);
    const newJourneyId = (leftover.headers.location as string).match(/^\/journey\/([^/]+)$/)?.[1];
    const newJourney = await getPool().query(
      `SELECT student_user_id FROM driving_journeys WHERE id = $1`,
      [newJourneyId],
    );
    assert.notEqual(newJourney.rows[0].student_user_id, seeded.supervisorId);
    await app.close();
  });

  it("audits waitlist status changes", async () => {
    const admin = await seedAdmin();
    const saved = await saveInterestSignup({
      name: "Anna",
      email: "anna@example.com",
      role: "parent",
      platformIos: true,
    });
    assert.ok(saved);
    const app = await createTestApp();
    await app.inject({
      method: "POST",
      url: `/admin/signups/${saved.signup.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ status: "invited", admin_note: "skickat" }),
    });
    const audit = await getPool().query(
      `SELECT operation, target_id, summary FROM admin_audit_events`,
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].operation, "waitlist_update");
    assert.equal(audit.rows[0].target_id, saved.signup.id);
    assert.match(audit.rows[0].summary, /new → invited/);
    await app.close();
  });
});
