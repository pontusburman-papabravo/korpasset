import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { getAdminUsage } from "../src/services/admin-usage.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { acceptInvitation, createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { recordProductEvent } from "../src/services/product-events.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

async function skill(): Promise<{ id: string; title: string }> {
  const row = await getPool().query(
    `SELECT s.id, sd.title
     FROM skills s
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     ORDER BY s.skill_key
     LIMIT 1`,
  );
  return { id: String(row.rows[0].id), title: String(row.rows[0].title) };
}

describe("admin usage", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("shows who uses each journey, how far they got, and in what way", async () => {
    const focus = await skill();
    const student = await createJourneyForStudent("Ella", null, "building", "parent_handoff");
    await getPool().query(
      `UPDATE driving_journeys SET transmission_scope = 'manual' WHERE id = $1`,
      [student.journey.id],
    );
    await getPool().query(
      `UPDATE users
       SET contact_email = 'ella@example.com',
           contact_email_normalized = 'ella@example.com'
       WHERE id = $1`,
      [student.userId],
    );
    const signup = await saveInterestSignup({
      name: "Ella",
      email: "ella@example.com",
      role: "student",
      platformIos: true,
    });
    assert.ok(signup);
    const invitation = await createInvitation(student.journey.id, student.userId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);

    async function ratedDrive(hoursAgo: number) {
      const drive = await getPool().query(
        `INSERT INTO drives (
           journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at,
           environment, light_condition
         )
         VALUES (
           $1, $2, $2,
           now() - interval '${hoursAgo} hours' - interval '40 minutes',
           now() - interval '${hoursAgo} hours',
           ARRAY['urban']::driving_environment[],
           'daylight'
         )
         RETURNING id`,
        [student.journey.id, supervisor.userId],
      );
      const driveId = String(drive.rows[0].id);
      await getPool().query(
        `INSERT INTO drive_focus_skills (drive_id, journey_id, skill_id)
         VALUES ($1, $2, $3)`,
        [driveId, student.journey.id, focus.id],
      );
      await getPool().query(
        `INSERT INTO drive_observations (
           journey_id, drive_id, skill_id, observer_user_id, source_type, assessment
         )
         VALUES ($1, $2, $3, $4, 'supervisor', 'with_support')`,
        [student.journey.id, driveId, focus.id, supervisor.userId],
      );
    }

    await ratedDrive(48);
    await ratedDrive(2);

    const quiet = await createJourneyForStudent("Nora");
    await recordProductEvent({
      name: "onboarding_role_selected",
      actorRole: "supervisor",
      eventSource: "direct",
    });

    const usage = await getAdminUsage();
    const ella = usage.journeys.find((journey) => journey.journeyId === student.journey.id);
    assert.ok(ella);
    assert.equal(ella.student.name, "Ella");
    assert.equal(ella.supervisors[0]?.name, "Pappa");
    assert.equal(ella.source, "parent_handoff");
    assert.equal(ella.practiceStage, "building");
    assert.equal(ella.transmission, "manual");
    assert.equal(ella.drivesStarted, 2);
    assert.equal(ella.ratedDrives, 2);
    assert.equal(ella.stuck, "through");
    assert.equal(ella.waitlist?.status, "new");
    assert.equal(ella.waitlist?.platformIos, true);
    assert.equal(ella.waitlist?.id, signup.signup.id);

    const nora = usage.journeys.find((journey) => journey.journeyId === quiet.journey.id);
    assert.equal(nora?.source, "direct");
    assert.equal(nora?.stuck, "no_supervisor");
    assert.equal(nora?.waitlist, null);

    await getPool().query(
      `UPDATE users
       SET last_seen_at = now() - interval '1 day',
           client_platform = 'ios',
           client_app_version = '1.0.7',
           client_app_build = '7'
       WHERE id = $1`,
      [student.userId],
    );
    const withClient = await getAdminUsage();
    const ellaSeen = withClient.journeys.find((journey) => journey.journeyId === student.journey.id);
    assert.equal(ellaSeen?.student.client.platform, "ios");
    assert.equal(ellaSeen?.student.client.appVersion, "1.0.7");
    assert.equal(ellaSeen?.student.client.appBuild, "7");
    assert.ok(ellaSeen && ellaSeen.lastActivityAt >= ella.lastActivityAt);

    assert.equal(usage.bySource.find((row) => row.key === "parent_handoff")?.count, 1);
    assert.equal(usage.byPracticeStage.find((row) => row.key === "building")?.count, 1);
    assert.equal(usage.byTransmission.find((row) => row.key === "manual")?.count, 1);
    assert.equal(usage.bySupervisorCount.find((row) => row.key === "1")?.count, 1);
    assert.equal(usage.bySupervisorCount.find((row) => row.key === "0")?.count, 1);
    assert.equal(usage.drivesStartedBySupervisor, 2);
    assert.equal(usage.drivesStartedByStudent, 0);
    assert.equal(usage.byAssessment.find((row) => row.key === "with_support")?.count, 2);
    assert.equal(usage.focusSkills[0]?.title, focus.title);
    assert.equal(usage.focusSkills[0]?.drives, 2);
    assert.equal(usage.byEnvironment.find((row) => row.key === "urban")?.count, 2);
    assert.equal(usage.byLight.find((row) => row.key === "daylight")?.count, 2);
    assert.equal(usage.events.find((row) => row.key === "onboarding_supervisor")?.count, 1);
    assert.equal(usage.studentAccounts, 2);
    assert.equal(usage.supervisorAccounts, 1);

    const anna = await createGuestUser("Anna");
    const withAnna = await getAdminUsage();
    const annaRow = withAnna.journeys.find((journey) => journey.student.userId === anna.id);
    assert.equal(annaRow?.stuck, "no_journey");
    assert.equal(annaRow?.journeyId, "");

    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const hidden = await app.inject({ method: "GET", url: "/admin/statistik.csv" });
    assert.equal(hidden.statusCode, 302);

    const token = createAdminToken(admin.id);
    const page = await app.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { korpasset_admin: token },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Vilka som använder appen/);
    assert.match(page.body, /Ella/);
    assert.match(page.body, /Pappa/);
    assert.match(page.body, /Via handledare/);
    assert.match(page.body, /Bygger på/);
    assert.match(page.body, /Manuell/);
    assert.match(page.body, /Senast aktiv/);
    assert.match(page.body, /Fastnat: resan är inte skapad/);
    assert.match(page.body, /Fastnat: handledaren är inte ansluten/);
    assert.match(page.body, /Andra passet gjort/);
    assert.match(page.body, /iOS 1\.0\.7 \(7\)/);
    assert.match(page.body, new RegExp(focus.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(page.body, /Tätort/);
    assert.match(page.body, /Sidinträde, handledarspår/);
    assert.match(page.body, /Nora/);
    assert.match(page.body, /href="\/admin\/signups\/[^"]+"/);
    assert.doesNotMatch(page.body, /ella@example.com/);

    const csv = await app.inject({
      method: "GET",
      url: "/admin/statistik.csv",
      cookies: { korpasset_admin: token },
    });
    assert.equal(csv.statusCode, 200);
    assert.match(String(csv.headers["content-type"]), /text\/csv/);
    assert.match(csv.body, /Ella/);
    assert.match(csv.body, /Via handledare/);
    assert.match(csv.body, /Andra passet gjort/);
    assert.match(csv.body, /iOS 1\.0\.7 \(7\)/);
    assert.match(csv.body, new RegExp(signup.signup.id));

    const ignored = await app.inject({
      method: "POST",
      url: "/api/client",
      payload: { platform: "android", version: "9.9.9", build: "1" },
    });
    assert.equal(ignored.statusCode, 204);
    const before = await getPool().query(
      `SELECT client_platform FROM users WHERE id = $1`,
      [quiet.userId],
    );
    assert.equal(before.rows[0].client_platform, null);

    const reported = await app.inject({
      method: "POST",
      url: "/api/client",
      cookies: { [config.sessionCookieName]: createSessionToken(quiet.userId) },
      payload: { platform: "android", version: "1.0.7", build: "7" },
    });
    assert.equal(reported.statusCode, 204);
    const after = await getPool().query(
      `SELECT client_platform, client_app_version, client_app_build, last_seen_at
       FROM users WHERE id = $1`,
      [quiet.userId],
    );
    assert.equal(after.rows[0].client_platform, "android");
    assert.equal(after.rows[0].client_app_version, "1.0.7");
    assert.equal(after.rows[0].client_app_build, "7");
    assert.ok(after.rows[0].last_seen_at);
    await app.close();
  });
});
