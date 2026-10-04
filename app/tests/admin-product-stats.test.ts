import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { getAdminProductStats, getJourneyUsageDetail } from "../src/services/admin-product-stats.js";
import { filterUsageJourneys, type UsageJourney } from "../src/services/admin-usage.js";
import { acceptInvitation, createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { readinessPercent } from "../src/services/progression.js";
import { createGuestUser } from "../src/services/users.js";
import {
  driveCountBucket,
  journeyUsageStatus,
  progressBucket,
  stuckSignals,
  type UsageSnapshot,
  type UsageWindows,
} from "../src/services/usage-metrics.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const windows: UsageWindows = {
  start7: new Date("2026-09-28T22:00:00.000Z"),
  start14: new Date("2026-09-21T22:00:00.000Z"),
  start30: new Date("2026-09-05T22:00:00.000Z"),
};

function snap(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    hasJourney: true,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    activeSupervisors: 1,
    completedDrives: 3,
    lastCompletedAt: new Date("2026-09-29T12:00:00.000Z"),
    trainedObservations: 2,
    checkoffSteps: 1,
    progressionPercent: 12,
    progressionIncreased30d: true,
    ...overrides,
  };
}

function row(overrides: Partial<UsageJourney>): UsageJourney {
  return {
    journeyId: "j",
    student: {
      userId: "u",
      name: "Elev",
      removed: false,
      client: { platform: null, appVersion: null, appBuild: null },
    },
    supervisors: [],
    createdAt: "2026-09-01T12:00:00.000Z",
    lastActivityAt: "2026-09-01T12:00:00.000Z",
    source: "unknown",
    practiceStage: "unknown",
    transmission: "unknown",
    activeSupervisors: 0,
    drivesStarted: 0,
    drivesCompleted: 0,
    drivesCompleted30d: 0,
    durationSeconds: 0,
    lastCompletedAt: null,
    trainedObservations: 0,
    uniqueSkillsTrained: 0,
    checkoffSteps: 0,
    progressionPercent: 0,
    pendingInvites: 0,
    status: "not_started",
    signals: [],
    ratedDrives: 0,
    stuck: "no_drive",
    waitlist: null,
    ...overrides,
  };
}

describe("usage status and stuck signals", () => {
  it("treats the window start as inside and one millisecond before as outside", () => {
    assert.equal(
      journeyUsageStatus(snap({ completedDrives: 0, createdAt: windows.start7, lastCompletedAt: null }), windows),
      "new",
    );
    assert.equal(
      journeyUsageStatus(
        snap({
          completedDrives: 0,
          createdAt: new Date(windows.start7.getTime() - 1),
          lastCompletedAt: null,
        }),
        windows,
      ),
      "not_started",
    );
    assert.equal(
      journeyUsageStatus(
        snap({ completedDrives: 4, lastCompletedAt: new Date(windows.start30.getTime() - 1) }),
        windows,
      ),
      "inactive",
    );
    assert.equal(
      journeyUsageStatus(snap({ completedDrives: 1, lastCompletedAt: windows.start14 }), windows),
      "one_drive",
    );
    assert.equal(
      journeyUsageStatus(
        snap({ completedDrives: 1, lastCompletedAt: new Date(windows.start14.getTime() - 1) }),
        windows,
      ),
      "stuck",
    );
    assert.equal(
      journeyUsageStatus(snap({ lastCompletedAt: windows.start30, progressionIncreased30d: true }), windows),
      "stuck",
    );
    assert.equal(journeyUsageStatus(snap(), windows), "active");
    assert.equal(
      journeyUsageStatus(
        snap({ hasJourney: false, createdAt: windows.start7, completedDrives: 0, lastCompletedAt: null }),
        windows,
      ),
      "new",
    );
  });

  it("keeps several stuck signals without folding them into one total", () => {
    const lapsed = snap({
      completedDrives: 1,
      lastCompletedAt: new Date("2026-08-01T12:00:00.000Z"),
      trainedObservations: 0,
      checkoffSteps: 0,
      progressionIncreased30d: false,
    });
    const signals = stuckSignals(lapsed, windows);
    assert.deepEqual(signals, ["exactly_one_drive", "no_drive_7d", "no_drive_14d", "no_drive_30d"]);
    assert.equal(journeyUsageStatus(lapsed, windows), "inactive");

    const loggingOnly = snap({
      trainedObservations: 0,
      checkoffSteps: 0,
      progressionIncreased30d: false,
      progressionPercent: 0,
    });
    assert.ok(stuckSignals(loggingOnly, windows).includes("drives_without_training"));
    assert.ok(stuckSignals(loggingOnly, windows).includes("drives_without_checkoffs"));
    assert.ok(stuckSignals(loggingOnly, windows).includes("driving_without_progression"));
    assert.equal(stuckSignals(loggingOnly, windows).length, 3);

    const fresh = snap({
      hasJourney: true,
      activeSupervisors: 1,
      completedDrives: 0,
      lastCompletedAt: null,
      createdAt: windows.start7,
    });
    assert.deepEqual(stuckSignals(fresh, windows), ["supervisor_no_drive"]);
    assert.deepEqual(
      stuckSignals(snap({ hasJourney: false, completedDrives: 0, lastCompletedAt: null }), windows),
      ["no_journey"],
    );
    assert.deepEqual(
      stuckSignals(snap({ activeSupervisors: 0, completedDrives: 0, lastCompletedAt: null }), windows),
      ["no_supervisor"],
    );
  });

  it("places drive counts and progression on the documented boundaries", () => {
    assert.equal(driveCountBucket(0), "0");
    assert.equal(driveCountBucket(1), "1");
    assert.equal(driveCountBucket(2), "2");
    assert.equal(driveCountBucket(4), "3-4");
    assert.equal(driveCountBucket(5), "5-9");
    assert.equal(driveCountBucket(9), "5-9");
    assert.equal(driveCountBucket(10), "10-19");
    assert.equal(driveCountBucket(19), "10-19");
    assert.equal(driveCountBucket(20), "20+");
    assert.equal(progressBucket(0), "0");
    assert.equal(progressBucket(1), "1-24");
    assert.equal(progressBucket(24), "1-24");
    assert.equal(progressBucket(25), "25-49");
    assert.equal(progressBucket(100), "100");
  });

  it("filters the table from server fields, including zero drives and missing supervisors", () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    const journeys = [
      row({
        journeyId: "",
        drivesCompleted: 0,
        lastActivityAt: now.toISOString(),
        createdAt: now.toISOString(),
        student: {
          userId: "a",
          name: "Anna",
          removed: false,
          client: { platform: null, appVersion: null, appBuild: null },
        },
      }),
      row({
        journeyId: "nora",
        activeSupervisors: 0,
        drivesCompleted: 0,
        createdAt: "2026-08-01T12:00:00.000Z",
        lastActivityAt: "2026-08-01T12:00:00.000Z",
        student: {
          userId: "n",
          name: "Nora",
          removed: false,
          client: { platform: null, appVersion: null, appBuild: null },
        },
      }),
      row({
        journeyId: "ella",
        activeSupervisors: 2,
        drivesCompleted: 6,
        checkoffSteps: 3,
        progressionPercent: 100,
        lastActivityAt: now.toISOString(),
        student: {
          userId: "e",
          name: "Ella",
          removed: false,
          client: { platform: null, appVersion: null, appBuild: null },
        },
      }),
    ];
    assert.deepEqual(
      filterUsageJourneys(journeys, "drives0", now).map((item) => item.student.name),
      ["Anna", "Nora"],
    );
    assert.deepEqual(
      filterUsageJourneys(journeys, "no_supervisor", now).map((item) => item.student.name),
      ["Nora"],
    );
    assert.deepEqual(
      filterUsageJourneys(journeys, "has_supervisor", now).map((item) => item.student.name),
      ["Ella"],
    );
    assert.deepEqual(
      filterUsageJourneys(journeys, "drives5", now).map((item) => item.student.name),
      ["Ella"],
    );
    assert.deepEqual(
      filterUsageJourneys(journeys, "has_checkoffs", now).map((item) => item.student.name),
      ["Ella"],
    );
    assert.deepEqual(
      filterUsageJourneys(journeys, "progress100", now).map((item) => item.student.name),
      ["Ella"],
    );
    assert.equal(filterUsageJourneys(journeys, "active7", now).length, 2);
  });
});

async function skill(key: string): Promise<{ id: string; title: string }> {
  const result = await getPool().query(
    `SELECT s.id, sd.title
     FROM skills s
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     WHERE s.skill_key = $1`,
    [key],
  );
  return { id: String(result.rows[0].id), title: String(result.rows[0].title) };
}

async function stockholmStart(days: number): Promise<Date> {
  const result = await getPool().query(
    `SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Stockholm') - interval '${days - 1} days') AT TIME ZONE 'Europe/Stockholm' AS start`,
  );
  return new Date(String(result.rows[0].start));
}

async function insertDrive(input: {
  journeyId: string;
  actorId: string;
  startedAt: Date;
  endedAt: Date | null;
  distance?: number | null;
  skillId?: string;
  assessment?: "needs_help" | "with_support" | "independent";
  steps?: string[];
}): Promise<string> {
  const drive = await getPool().query(
    `INSERT INTO drives (
       journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at, distance_meters
     )
     VALUES ($1, $2, $2, $3, $4, $5)
     RETURNING id`,
    [input.journeyId, input.actorId, input.startedAt, input.endedAt, input.distance ?? null],
  );
  const driveId = String(drive.rows[0].id);
  if (input.skillId && input.assessment) {
    await getPool().query(
      `INSERT INTO drive_focus_skills (drive_id, journey_id, skill_id) VALUES ($1, $2, $3)`,
      [driveId, input.journeyId, input.skillId],
    );
    await getPool().query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id, source_type, assessment, completed_step_keys
       )
       VALUES ($1, $2, $3, $4, 'supervisor', $5, $6::text[])`,
      [
        input.journeyId,
        driveId,
        input.skillId,
        input.actorId,
        input.assessment,
        input.steps ?? [],
      ],
    );
  }
  return driveId;
}

describe("admin product stats", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("counts a completed drive once when two supervisors are connected", async () => {
    const focus = await skill("car_control_pre_drive_check");
    const student = await createJourneyForStudent("Ella");
    const first = await acceptInvitation(
      (await createInvitation(student.journey.id, student.userId)).token,
      "Pappa",
      null,
    );
    await acceptInvitation(
      (await createInvitation(student.journey.id, student.userId)).token,
      "Mamma",
      null,
    );
    const end = new Date();
    const start = new Date(end.getTime() - 40 * 60 * 1000);
    await insertDrive({
      journeyId: student.journey.id,
      actorId: first.userId,
      startedAt: start,
      endedAt: end,
      distance: 12500,
      skillId: focus.id,
      assessment: "with_support",
      steps: ["outside", "seat_belt"],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: first.userId,
      startedAt: new Date(end.getTime() - 3 * 60 * 60 * 1000),
      endedAt: new Date(end.getTime() - 2 * 60 * 60 * 1000),
      skillId: focus.id,
      assessment: "needs_help",
    });

    const stats = await getAdminProductStats("30");
    assert.equal(stats.drives.total, 2);
    assert.equal(stats.drives.students7d, 1);
    assert.equal(stats.drives.students30d, 1);
    assert.equal(stats.activeJourneys7d, 1);
    assert.equal(stats.journeys, 1);
    assert.equal(stats.students, 1);
    assert.equal(stats.supervisors, 2);
    assert.equal(stats.drives.durationSeconds, 40 * 60 + 60 * 60);
    assert.equal(stats.drives.avgDurationSeconds, (40 * 60 + 60 * 60) / 2);
    assert.equal(stats.drives.medianDurationSeconds, (40 * 60 + 60 * 60) / 2);
    assert.equal(stats.drives.distanceMeters, 12500);
    assert.equal(stats.drives.drivesWithDistance, 1);
    assert.equal(stats.drives.perActiveStudentAvg, 2);
    assert.equal(stats.driveBuckets.find((bucket) => bucket.key === "2")?.count, 1);
    assert.equal(stats.milestones.atLeast1, 1);
    assert.equal(stats.milestones.atLeast2, 1);
    assert.equal(stats.moments.trainings, 2);
    assert.equal(stats.moments.checkoffs, 2);
    assert.equal(stats.moments.uniqueTrained, 1);
    assert.equal(stats.supervisorStats.withActiveSupervisor, 1);
    assert.equal(stats.supervisorStats.participated, 1);
    assert.equal(stats.supervisorStats.buckets.find((bucket) => bucket.key === "2")?.count, 1);

    const detail = await getJourneyUsageDetail(student.journey.id);
    assert.ok(detail);
    assert.equal(detail.summary.drives, 2);
    assert.equal(detail.summary.activeSupervisors, 2);
    assert.ok(detail.timeline.some((event) => event.label === "Körpass 1 genomfört"));
    assert.ok(detail.timeline.some((event) => event.label === "Handledare inbjuden"));
    assert.ok(detail.timeline.some((event) => event.label === "Handledare ansluten" && event.detail === "Pappa"));
    assert.ok(detail.timeline.some((event) => event.label === "Moment tränat"));
    assert.ok(detail.timeline.some((event) => event.label === "Moment avbockat"));
  });

  it("ignores open drives and counts a drive that ends exactly on the window boundary", async () => {
    const focus = await skill("observation_mirror_routine");
    const inside = await createJourneyForStudent("Inne");
    const outside = await createJourneyForStudent("Ute");
    const open = await createJourneyForStudent("Öppen");
    const start7 = await stockholmStart(7);
    await insertDrive({
      journeyId: inside.journey.id,
      actorId: inside.userId,
      startedAt: new Date(start7.getTime() - 30 * 60 * 1000),
      endedAt: start7,
      skillId: focus.id,
      assessment: "independent",
      steps: ["before_slow", "before_turn", "behind"],
    });
    await insertDrive({
      journeyId: outside.journey.id,
      actorId: outside.userId,
      startedAt: new Date(start7.getTime() - 60 * 60 * 1000),
      endedAt: new Date(start7.getTime() - 1),
    });
    const openId = await insertDrive({
      journeyId: open.journey.id,
      actorId: open.userId,
      startedAt: new Date(),
      endedAt: null,
      skillId: focus.id,
      assessment: "needs_help",
      steps: ["before_slow"],
    });
    assert.ok(openId);

    const stats = await getAdminProductStats("7");
    assert.equal(stats.drives.last7d, 1);
    assert.equal(stats.drives.total, 2);
    assert.equal(stats.activeJourneys7d, 1);
    assert.equal(stats.moments.trainings, 1);
    assert.equal(stats.moments.drivesWithTraining, 1);
    assert.equal(stats.moments.completedDrives, 2);
    const detail = await getJourneyUsageDetail(open.journey.id);
    assert.equal(detail?.summary.drives, 0);
    assert.ok(detail?.timeline.some((event) => event.detail.includes("räknas inte som genomfört")));
    assert.equal(detail?.timeline.some((event) => event.label === "Moment tränat"), false);
  });

  it("includes a second drive exactly 7 days later and excludes one second later", async () => {
    const early = await createJourneyForStudent("Tidig");
    const late = await createJourneyForStudent("Sen");
    const firstEarly = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const firstLate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await getPool().query(`UPDATE users SET created_at = $2 WHERE id = $1`, [
      early.userId,
      new Date(firstEarly.getTime() - 2 * 24 * 60 * 60 * 1000),
    ]);
    await insertDrive({
      journeyId: early.journey.id,
      actorId: early.userId,
      startedAt: new Date(firstEarly.getTime() - 30 * 60 * 1000),
      endedAt: firstEarly,
    });
    await insertDrive({
      journeyId: early.journey.id,
      actorId: early.userId,
      startedAt: new Date(firstEarly.getTime() + 7 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000),
      endedAt: new Date(firstEarly.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    await insertDrive({
      journeyId: late.journey.id,
      actorId: late.userId,
      startedAt: new Date(firstLate.getTime() - 30 * 60 * 1000),
      endedAt: firstLate,
    });
    await insertDrive({
      journeyId: late.journey.id,
      actorId: late.userId,
      startedAt: new Date(firstLate.getTime() + 7 * 24 * 60 * 60 * 1000 + 1000 - 30 * 60 * 1000),
      endedAt: new Date(firstLate.getTime() + 7 * 24 * 60 * 60 * 1000 + 1000),
    });

    const stats = await getAdminProductStats("all");
    assert.equal(stats.milestones.withFirst, 2);
    assert.equal(stats.milestones.secondTotal, 2);
    assert.equal(stats.milestones.secondWithin7d, 1);
    assert.equal(stats.milestones.secondWithin14d, 2);
    assert.ok(stats.milestones.medianRegisterToFirstSeconds != null);
    assert.ok(Math.abs((stats.milestones.medianRegisterToFirstSeconds ?? 0) - 2 * 86400) < 2);
    assert.ok(stats.milestones.medianFirstToSecondSeconds != null);
    const expectedGap = (7 * 86400 + (7 * 86400 + 1)) / 2;
    assert.ok(Math.abs((stats.milestones.medianFirstToSecondSeconds ?? 0) - expectedGap) < 2);

    const cohorts = stats.retention.byFirstDrive;
    assert.ok(cohorts.length >= 1);
    assert.equal(cohorts[0]?.drive[0]?.rate, 100);
  });

  it("separates training from checklist completion and follows the app progression model", async () => {
    const gear = await skill("car_control_gear_shifting");
    const mirrors = await skill("observation_mirror_routine");
    const check = await skill("car_control_pre_drive_check");
    const skillCount = await getPool().query(
      `SELECT count(*)::int AS n FROM skill_definitions WHERE taxonomy_version = 1`,
    );
    const totalSkills = Number(skillCount.rows[0].n);

    const automatic = await createJourneyForStudent("Automat");
    await getPool().query(
      `UPDATE driving_journeys SET transmission_scope = 'automatic_only' WHERE id = $1`,
      [automatic.journey.id],
    );
    const end = new Date();
    await insertDrive({
      journeyId: automatic.journey.id,
      actorId: automatic.userId,
      startedAt: new Date(end.getTime() - 20 * 60 * 1000),
      endedAt: end,
      skillId: gear.id,
      assessment: "independent",
    });
    await insertDrive({
      journeyId: automatic.journey.id,
      actorId: automatic.userId,
      startedAt: new Date(end.getTime() - 50 * 60 * 1000),
      endedAt: new Date(end.getTime() - 30 * 60 * 1000),
      skillId: mirrors.id,
      assessment: "needs_help",
    });

    const manual = await createJourneyForStudent("Manuell");
    const driveId = await insertDrive({
      journeyId: manual.journey.id,
      actorId: manual.userId,
      startedAt: new Date(end.getTime() - 15 * 60 * 1000),
      endedAt: end,
      skillId: check.id,
      assessment: "with_support",
      steps: ["outside"],
    });
    const firstObs = await getPool().query(
      `SELECT id FROM drive_observations WHERE drive_id = $1 AND journey_id = $2`,
      [driveId, manual.journey.id],
    );
    await getPool().query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id, source_type, assessment,
         completed_step_keys, supersedes_observation_id
       )
       VALUES ($1, $2, $3, $4, 'supervisor', 'independent', $5::text[], $6)`,
      [
        manual.journey.id,
        driveId,
        check.id,
        manual.userId,
        ["outside", "seat_belt", "mirrors", "controls"],
        String(firstObs.rows[0].id),
      ],
    );

    const stats = await getAdminProductStats("30");
    const automaticFact = stats.progression.buckets;
    assert.ok(automaticFact);
    const autoPercent = readinessPercent(1, (totalSkills - 1) * 3);
    const manualPercent = readinessPercent(3, totalSkills * 3);
    const detailAuto = await getJourneyUsageDetail(automatic.journey.id);
    const detailManual = await getJourneyUsageDetail(manual.journey.id);
    assert.equal(detailAuto?.summary.progressionPercent, autoPercent);
    assert.equal(detailManual?.summary.progressionPercent, manualPercent);
    assert.equal(detailManual?.summary.uniqueSkills, 1);
    assert.equal(detailManual?.summary.checkoffs, 4);
    assert.equal(detailManual?.summary.fullChecklists, 1);
    assert.equal(stats.moments.trainings, 3);
    const checkRow = stats.skills.find((item) => item.skillKey === "car_control_pre_drive_check");
    assert.equal(checkRow?.trainings, 1);
    assert.equal(checkRow?.checkoffs, 4);
    assert.equal(checkRow?.studentsCompleted, 1);
    assert.equal(checkRow?.studentsTrained, 1);
    assert.ok(stats.areas.some((area) => area.areaTitle === "Bilkontroll"));
    assert.ok(stats.areas.some((area) => area.trainings > 0));
  });

  it("reports overlapping stuck signals and skips deleted accounts", async () => {
    const quiet = await createJourneyForStudent("Nora");
    const supervisor = await acceptInvitation(
      (await createInvitation(quiet.journey.id, quiet.userId)).token,
      "Pappa",
      null,
    );
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await insertDrive({
      journeyId: quiet.journey.id,
      actorId: supervisor.userId,
      startedAt: new Date(longAgo.getTime() - 30 * 60 * 1000),
      endedAt: longAgo,
    });
    const removed = await createGuestUser("Borttagen");
    await getPool().query(`UPDATE users SET account_state = 'deleted' WHERE id = $1`, [removed.id]);
    await createGuestUser("Anna");

    const stats = await getAdminProductStats("30");
    const byKey = new Map(stats.stuck.signals.map((signal) => [signal.key, signal.count]));
    assert.equal(byKey.get("exactly_one_drive"), 1);
    assert.equal(byKey.get("no_drive_7d"), 1);
    assert.equal(byKey.get("no_drive_14d"), 1);
    assert.equal(byKey.get("no_drive_30d"), 1);
    assert.equal(byKey.get("no_journey"), 1);
    assert.equal(stats.stuck.journeysWithSignal, 1);
    const signalSum = stats.stuck.signals.reduce((sum, signal) => sum + signal.count, 0);
    assert.ok(signalSum > stats.stuck.journeysWithSignal);
    assert.equal(stats.accounts, 3);
    assert.equal(stats.accountsWithoutJourney, 1);
    assert.equal(stats.drives.total, 1);
    assert.equal(stats.drives.last30d, 0);
  });

  it("keeps the statistik page and csv available to admin only", async () => {
    const student = await createJourneyForStudent("Ella");
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const hidden = await app.inject({
      method: "GET",
      url: `/admin/statistik/resa/${student.journey.id}`,
    });
    assert.equal(hidden.statusCode, 302);
    const asStudent = await app.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { [config.sessionCookieName]: createSessionToken(student.userId) },
    });
    assert.equal(asStudent.statusCode, 302);

    const token = createAdminToken(admin.id);
    const page = await app.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { korpasset_admin: token },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Användning/);
    assert.match(page.body, /Fördelning av antal körpass/);
    assert.match(page.body, /Andra pass inom 7 dagar/);
    assert.match(page.body, /Moment och checklistor/);
    assert.match(page.body, /Beta-funnel/);
    assert.match(page.body, /Canonical observationer/);
    assert.match(page.body, /Vilka som använder appen/);
    assert.match(page.body, /data-usage-filter="all" aria-pressed="true"/);
    assert.match(page.body, /0 körpass/);
    assert.match(page.body, new RegExp(`/admin/statistik/resa/${student.journey.id}`));

    const csv = await app.inject({
      method: "GET",
      url: "/admin/statistik.csv",
      cookies: { korpasset_admin: token },
    });
    assert.match(csv.body, /korpass_genomforda/);
    assert.match(csv.body, /progression_procent/);
    assert.match(csv.body, /Ella/);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/statistik/resa/${student.journey.id}`,
      cookies: { korpasset_admin: token },
    });
    assert.equal(detail.statusCode, 200);
    assert.match(detail.body, /Konto skapat/);
    assert.match(detail.body, /Resa skapad/);
    assert.doesNotMatch(detail.body, /token/);

    const missing = await app.inject({
      method: "GET",
      url: "/admin/statistik/resa/00000000-0000-4000-8000-000000000000",
      cookies: { korpasset_admin: token },
    });
    assert.equal(missing.statusCode, 404);
    await app.close();
  });
});
