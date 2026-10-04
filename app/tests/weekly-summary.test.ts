import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { EmailSendError, setMailerForTests, type OutboundEmail } from "../src/services/email.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { readinessPercent } from "../src/services/progression.js";
import { createGuestUser } from "../src/services/users.js";
import {
  buildWeeklySummaryEmail,
  greetingName,
  weeklyFeedback,
  weeklySummaryForbiddenPhrases,
} from "../src/services/weekly-summary-email.js";
import { weeklyProductUpdateForWeek } from "../src/services/weekly-product-update.js";
import { sendWeeklySummaryEmails } from "../src/services/weekly-summary-mail.js";
import {
  getJourneyWeeklySummary,
  isWeeklySummarySendWindow,
  previousStockholmWeek,
  stockholmCivil,
  stockholmWeekContaining,
  type JourneyWeeklySummary,
} from "../src/services/weekly-summary.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const sent: OutboundEmail[] = [];
let failFor: string | null = null;

function blankSummary(overrides: Partial<JourneyWeeklySummary> = {}): JourneyWeeklySummary {
  return {
    journeyId: "j",
    timeZone: "Europe/Stockholm",
    weekKey: "2026-W40",
    start: "2026-09-27T22:00:00.000Z",
    end: "2026-10-04T22:00:00.000Z",
    completedDrives: 0,
    totalDriveSeconds: 0,
    totalDriveMinutes: 0,
    trainedSkills: 0,
    uniqueTrainedSkills: 0,
    newlyTrainedSkills: 0,
    checkoffSteps: 0,
    completedSkills: 0,
    newlyCompletedSkills: 0,
    progressionStart: 0,
    progressionEnd: 0,
    supervisorsUsed: 0,
    distanceMeters: null,
    topSkills: [],
    firstDriveThisWeek: false,
    ...overrides,
  };
}

async function setEmail(userId: string, email: string | null): Promise<void> {
  await getPool().query(
    `UPDATE users
     SET contact_email = $2, contact_email_normalized = $3
     WHERE id = $1`,
    [userId, email, email?.toLowerCase() ?? null],
  );
}

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

async function insertDrive(input: {
  journeyId: string;
  actorId: string;
  supervisorId?: string;
  startedAt: Date;
  endedAt: Date | null;
  distance?: number | null;
  observations?: Array<{
    skillId: string;
    assessment: "needs_help" | "with_support" | "independent";
    steps?: string[];
    observedAt?: Date;
  }>;
}): Promise<string> {
  const drive = await getPool().query(
    `INSERT INTO drives (
       journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at, distance_meters
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.journeyId,
      input.actorId,
      input.supervisorId ?? input.actorId,
      input.startedAt,
      input.endedAt,
      input.distance ?? null,
    ],
  );
  const driveId = String(drive.rows[0].id);
  for (const observation of input.observations ?? []) {
    await getPool().query(
      `INSERT INTO drive_focus_skills (drive_id, journey_id, skill_id) VALUES ($1, $2, $3)`,
      [driveId, input.journeyId, observation.skillId],
    );
    await getPool().query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id, source_type, assessment,
         completed_step_keys, observed_at
       )
       VALUES ($1, $2, $3, $4, 'supervisor', $5, $6::text[], $7)`,
      [
        input.journeyId,
        driveId,
        observation.skillId,
        input.supervisorId ?? input.actorId,
        observation.assessment,
        observation.steps ?? [],
        observation.observedAt ?? input.endedAt ?? input.startedAt,
      ],
    );
  }
  return driveId;
}

describe("weekly summary calendar", () => {
  it("opens the send window on Sunday at 18:00 Stockholm and not before", () => {
    assert.equal(isWeeklySummarySendWindow(0, 17), false);
    assert.equal(isWeeklySummarySendWindow(0, 18), true);
    assert.equal(isWeeklySummarySendWindow(0, 23), true);
    assert.equal(isWeeklySummarySendWindow(1, 10), false);
    assert.equal(isWeeklySummarySendWindow(6, 18), false);
  });

  it("uses Stockholm Monday bounds, including the spring DST week", async () => {
    const winter = await stockholmWeekContaining(await stockholmCivil(2026, 1, 11, 18, 0));
    assert.equal(winter.weekKey, "2026-W02");
    assert.equal(winter.dow, 0);
    assert.equal(winter.hour, 18);
    assert.equal(winter.start.toISOString(), "2026-01-04T23:00:00.000Z");
    assert.equal(winter.end.toISOString(), "2026-01-11T23:00:00.000Z");
    assert.equal(winter.end.getTime() - winter.start.getTime(), 7 * 24 * 60 * 60 * 1000);

    const spring = await stockholmWeekContaining(await stockholmCivil(2026, 3, 29, 18, 0));
    assert.equal(spring.start.toISOString(), "2026-03-22T23:00:00.000Z");
    assert.equal(spring.end.toISOString(), "2026-03-29T22:00:00.000Z");
    assert.equal(spring.end.getTime() - spring.start.getTime(), (7 * 24 - 1) * 60 * 60 * 1000);
    assert.equal(isWeeklySummarySendWindow(spring.dow, spring.hour), true);

    const before = await stockholmWeekContaining(await stockholmCivil(2026, 10, 4, 17, 59));
    assert.equal(before.dow, 0);
    assert.equal(before.hour, 17);
    assert.equal(isWeeklySummarySendWindow(before.dow, before.hour), false);
  });
});

describe("weekly summary copy", () => {
  it("uses the first name, real numbers and a calm tone", () => {
    assert.equal(greetingName("Nora Svensson"), "Nora");
    assert.equal(greetingName("  "), null);

    const summary = blankSummary({
      completedDrives: 3,
      totalDriveMinutes: 135,
      totalDriveSeconds: 135 * 60,
      trainedSkills: 9,
      uniqueTrainedSkills: 7,
      newlyTrainedSkills: 2,
      checkoffSteps: 8,
      completedSkills: 3,
      newlyCompletedSkills: 3,
      progressionStart: 28,
      progressionEnd: 35,
      supervisorsUsed: 2,
      distanceMeters: 1500,
      firstDriveThisWeek: true,
      topSkills: [
        { skillKey: "maneuver_parking", title: "Övrig parkering", trainings: 4 },
        { skillKey: "positioning_road_position", title: "Placering på vägen", trainings: 2 },
        { skillKey: "roundabout_entry", title: "Infart i rondell", trainings: 1 },
      ],
    });
    const previous = blankSummary({
      completedDrives: 2,
      totalDriveMinutes: 60,
      uniqueTrainedSkills: 4,
      checkoffSteps: 2,
    });
    const email = buildWeeklySummaryEmail({
      displayName: "Nora Svensson",
      summary,
      previous,
      appUrl: "https://korpasset.se/app",
    });

    assert.equal(email.subject, "3 körpass den här veckan");
    assert.match(email.text, /^Hej Nora,/);
    assert.doesNotMatch(email.text, /Svensson/);
    assert.match(email.text, /🚗 3 körpass/);
    assert.match(email.text, /⏱ 2 h 15 min körning/);
    assert.match(email.text, /🎯 7 moment tränade/);
    assert.match(email.text, /2 av dem var nya den här veckan/);
    assert.match(email.text, /✅ 3 nya moment avbockade/);
    assert.match(email.text, /Du körde med 2 handledare/);
    assert.match(email.text, /Körsträcka 1,5 km/);
    assert.match(email.text, /1 körpass mer än förra veckan/);
    assert.match(email.text, /• Övrig parkering/);
    assert.match(email.text, /• Placering på vägen/);
    assert.match(email.text, /• Infart i rondell/);
    assert.match(email.text, /Du genomförde ditt första körpass i Körpasset den här veckan/);
    assert.match(email.text, /Stark vecka – du fick in 3 körpass/);
    assert.match(email.text, /Din progression gick från 28 % till 35 %/);
    assert.match(email.text, /Redo för nästa körpass\?/);
    assert.match(email.text, /Öppna Körpasset: https:\/\/korpasset\.se\/app/);
    assert.match(email.text, /Vi hörs nästa söndag/);
    assert.match(email.html, /<a href="https:\/\/korpasset\.se\/app">Öppna Körpasset<\/a>/);
    assert.deepEqual(weeklySummaryForbiddenPhrases(`${email.subject}\n${email.text}\n${email.html}`), []);
  });

  it("hides empty sections and does not show a percent change from zero", () => {
    const quiet = buildWeeklySummaryEmail({
      displayName: null,
      summary: blankSummary({
        completedDrives: 1,
        totalDriveMinutes: 20,
        firstDriveThisWeek: true,
        progressionStart: 0,
        progressionEnd: 4,
      }),
      previous: blankSummary(),
      appUrl: "https://korpasset.se/app",
    });
    assert.match(quiet.text, /^Hej,/);
    assert.doesNotMatch(quiet.text, /moment tränade/);
    assert.doesNotMatch(quiet.text, /avbock/);
    assert.doesNotMatch(quiet.text, /handledare/);
    assert.doesNotMatch(quiet.text, /Körsträcka/);
    assert.doesNotMatch(quiet.text, /tränade mest/);
    assert.doesNotMatch(quiet.text, /förra veckan/);
    assert.doesNotMatch(quiet.text, /från 0 %/);
    assert.match(quiet.text, /Din progression är 4 %/);

    const repeat = weeklyFeedback(
      blankSummary({
        completedDrives: 1,
        uniqueTrainedSkills: 4,
        trainedSkills: 4,
        newlyCompletedSkills: 0,
        checkoffSteps: 2,
      }),
    );
    assert.ok(repeat.some((line) => line.includes("Fortsätt repetera i lugn takt")));
    assert.equal(
      weeklySummaryForbiddenPhrases(repeat.join(" ")).length,
      0,
    );
    const behind = blankSummary({ completedDrives: 1, totalDriveMinutes: 10 });
    const worse = buildWeeklySummaryEmail({
      displayName: "Eli",
      summary: behind,
      previous: blankSummary({ completedDrives: 3, totalDriveMinutes: 80, uniqueTrainedSkills: 2, checkoffSteps: 4 }),
      appUrl: "https://korpasset.se/app",
    });
    assert.match(worse.text, /2 körpass färre än förra veckan/);
    assert.deepEqual(weeklySummaryForbiddenPhrases(worse.text), []);
  });

  it("shows this week's product note once and leaves other weeks without it", () => {
    const shareUrl = "https://korpasset.se/tips?r=LGBBLY2H&source=weekly_email";
    const busy = buildWeeklySummaryEmail({
      displayName: "Nora",
      summary: blankSummary({
        completedDrives: 3,
        totalDriveMinutes: 135,
        uniqueTrainedSkills: 4,
        newlyCompletedSkills: 2,
        progressionStart: 10,
        progressionEnd: 18,
      }),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl,
    });
    assert.equal(busy.subject, "3 körpass den här veckan");
    assert.doesNotMatch(busy.subject, /Nytt i Körpasset|Produktuppdatering/);
    assert.equal(busy.text.split("Nytt i Körpasset").length, 2);
    assert.match(busy.text, /Veckosammanfattningen är ny/);
    assert.doesNotMatch(busy.text, /erbjudande|kampanj|rabatt|uppgradera|Avregistrera|List-Unsubscribe/i);
    const noteAt = busy.text.indexOf("Nytt i Körpasset");
    const openAt = busy.text.indexOf("Öppna Körpasset:");
    const tipsAt = busy.text.indexOf(`Tipsa en vän: ${shareUrl}`);
    assert.ok(noteAt > busy.text.indexOf("🚗 3 körpass"));
    assert.ok(noteAt < openAt && openAt < tipsAt);
    assert.match(busy.text, /Din progression gick från 10 % till 18 %/);

    const first = buildWeeklySummaryEmail({
      displayName: "Eli",
      summary: blankSummary({
        completedDrives: 1,
        totalDriveMinutes: 25,
        firstDriveThisWeek: true,
        progressionEnd: 4,
      }),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl,
    });
    assert.equal(first.subject, "1 körpass den här veckan");
    assert.match(first.text, /Du genomförde ditt första körpass/);
    assert.equal(first.text.split("Nytt i Körpasset").length, 2);
    assert.match(first.text, new RegExp(shareUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const practiced = buildWeeklySummaryEmail({
      displayName: "Bo",
      summary: blankSummary({
        completedDrives: 1,
        totalDriveMinutes: 40,
        trainedSkills: 4,
        uniqueTrainedSkills: 4,
        newlyCompletedSkills: 0,
        checkoffSteps: 2,
      }),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl,
    });
    assert.match(practiced.text, /Fortsätt repetera i lugn takt/);
    assert.match(practiced.text, /✅ 2 körsteg avbockade/);
    assert.equal(practiced.text.split("Nytt i Körpasset").length, 2);
    assert.doesNotMatch(practiced.subject, /Nytt i Körpasset/);

    const nextWeek = buildWeeklySummaryEmail({
      displayName: "Nora",
      summary: blankSummary({
        weekKey: "2026-W41",
        completedDrives: 3,
        totalDriveMinutes: 135,
        uniqueTrainedSkills: 4,
        newlyCompletedSkills: 2,
      }),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl,
    });
    assert.equal(nextWeek.subject, "3 körpass den här veckan");
    assert.match(nextWeek.text, /🚗 3 körpass/);
    assert.doesNotMatch(nextWeek.text, /Nytt i Körpasset/);
    assert.match(nextWeek.text, new RegExp(shareUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(weeklyProductUpdateForWeek("2026-W40")?.title, "Nytt i Körpasset");
    assert.equal(weeklyProductUpdateForWeek("2026-W41"), null);
  });
});

describe("weekly summary mail", () => {
  beforeEach(async () => {
    await resetDatabaseData();
    sent.length = 0;
    failFor = null;
    setMailerForTests({
      async send(email) {
        if (failFor && email.to === failFor) throw new EmailSendError("Resend responded 500");
        sent.push(email);
        return { id: `msg-${sent.length}` };
      },
    });
  });

  afterEach(() => {
    setMailerForTests(null);
    failFor = null;
  });

  it("sums drives, time, training and new checkoffs inside the Stockholm week", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Nora Svensson");
    await setEmail(student.userId, "nora@example.com");
    const parking = await skill("maneuver_parking");
    const road = await skill("positioning_road_position");
    const lane = await skill("positioning_lane_selection");
    const roundabout = await skill("roundabout_entry");
    const dad = await createGuestUser("Pappa");
    const mum = await createGuestUser("Mamma");
    const minute = 60 * 1000;

    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      supervisorId: dad.id,
      startedAt: new Date(week.start.getTime() + 60 * minute),
      endedAt: new Date(week.start.getTime() + 105 * minute),
      distance: 1500,
      observations: [
        {
          skillId: parking.id,
          assessment: "with_support",
          steps: ["choose", "scan", "fit"],
          observedAt: new Date(week.start.getTime() + 100 * minute),
        },
        {
          skillId: road.id,
          assessment: "needs_help",
          steps: ["lane"],
          observedAt: new Date(week.start.getTime() + 100 * minute),
        },
      ],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      supervisorId: mum.id,
      startedAt: new Date(week.start.getTime() + 2 * 24 * 60 * minute),
      endedAt: new Date(week.start.getTime() + 2 * 24 * 60 * minute + 45 * minute),
      observations: [
        {
          skillId: parking.id,
          assessment: "independent",
          steps: ["choose", "scan", "fit"],
        },
        {
          skillId: lane.id,
          assessment: "independent",
          steps: ["where", "early", "not_follow"],
        },
      ],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      supervisorId: dad.id,
      startedAt: new Date(week.start.getTime() + 4 * 24 * 60 * minute),
      endedAt: new Date(week.start.getTime() + 4 * 24 * 60 * minute + 45 * minute),
      observations: [
        {
          skillId: roundabout.id,
          assessment: "needs_help",
          steps: ["slow"],
        },
      ],
    });

    const summary = await getJourneyWeeklySummary(student.journey.id, week);
    assert.ok(summary);
    assert.equal(summary.completedDrives, 3);
    assert.equal(summary.totalDriveSeconds, 135 * 60);
    assert.equal(summary.totalDriveMinutes, 135);
    assert.equal(summary.trainedSkills, 5);
    assert.equal(summary.uniqueTrainedSkills, 4);
    assert.equal(summary.newlyTrainedSkills, 4);
    assert.equal(summary.newlyCompletedSkills, 2);
    assert.equal(summary.completedSkills, 2);
    assert.equal(summary.supervisorsUsed, 2);
    assert.equal(summary.distanceMeters, 1500);
    assert.equal(summary.firstDriveThisWeek, true);
    assert.equal(summary.topSkills[0]?.title, parking.title);
    assert.equal(summary.topSkills.length, 3);
    assert.ok(summary.topSkills.every((item) => item.title.length > 0));

    const run = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(run.skippedWindow, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "nora@example.com");
    assert.match(sent[0]?.text ?? "", /Hej Nora,/);
    assert.match(sent[0]?.text ?? "", /3 körpass/);
    assert.match(sent[0]?.text ?? "", /2 h 15 min/);
    assert.match(sent[0]?.text ?? "", new RegExp(parking.title));
    assert.doesNotMatch(sent[0]?.text ?? "", /Pappa|Mamma|nora@example.com/);
    assert.deepEqual(weeklySummaryForbiddenPhrases(sent[0]?.text ?? ""), []);

    const row = await getPool().query(
      `SELECT week_key, template, status, provider_message_id, account_id, journey_id
       FROM journey_weekly_emails`,
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].week_key, week.weekKey);
    assert.equal(row.rows[0].template, "weekly_summary");
    assert.equal(row.rows[0].status, "sent");
    assert.equal(row.rows[0].provider_message_id, "msg-1");
    assert.equal(row.rows[0].account_id, student.userId);
    assert.equal(row.rows[0].journey_id, student.journey.id);
    const code = await getPool().query(
      `SELECT referral_code FROM users WHERE id = $1`,
      [student.userId],
    );
    const referralCode = String(code.rows[0].referral_code);
    assert.match(referralCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    assert.match(
      sent[0]?.text ?? "",
      new RegExp(`/tips\\?r=${referralCode}&source=weekly_email`),
    );
    assert.doesNotMatch(sent[0]?.text ?? "", new RegExp(student.userId));
    assert.doesNotMatch(sent[0]?.text ?? "", /nora@example.com/);
  });

  it("counts a new full checklist only when it happens inside the week", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const previous = await previousStockholmWeek(week);
    const student = await createJourneyForStudent("Eli");
    const parking = await skill("maneuver_parking");
    const lane = await skill("positioning_lane_selection");
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(previous.start.getTime() + 60 * 60 * 1000),
      endedAt: new Date(previous.start.getTime() + 2 * 60 * 60 * 1000),
      observations: [
        {
          skillId: parking.id,
          assessment: "independent",
          steps: ["choose", "scan", "fit"],
          observedAt: new Date(previous.start.getTime() + 2 * 60 * 60 * 1000),
        },
      ],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 2 * 60 * 60 * 1000),
      observations: [
        {
          skillId: parking.id,
          assessment: "independent",
          steps: ["choose", "scan", "fit"],
          observedAt: new Date(week.start.getTime() + 2 * 60 * 60 * 1000),
        },
        {
          skillId: lane.id,
          assessment: "with_support",
          steps: ["where", "early", "not_follow"],
          observedAt: new Date(week.start.getTime() + 2 * 60 * 60 * 1000),
        },
      ],
    });

    const summary = await getJourneyWeeklySummary(student.journey.id, week);
    assert.equal(summary?.newlyCompletedSkills, 1);
    assert.equal(summary?.completedSkills, 2);
    assert.equal(summary?.newlyTrainedSkills, 1);
    assert.equal(summary?.uniqueTrainedSkills, 2);
    const before = await getJourneyWeeklySummary(student.journey.id, previous);
    assert.equal(before?.newlyCompletedSkills, 1);
    assert.equal(before?.completedDrives, 1);
  });

  it("reads progression at the week start and at the week end", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Mio");
    const mirrors = await skill("observation_mirror_routine");
    const skillCount = await getPool().query(
      `SELECT count(*)::int AS n FROM skill_definitions WHERE taxonomy_version = 1`,
    );
    const total = Number(skillCount.rows[0].n);
    const beforeAt = new Date(week.start.getTime() - 60 * 60 * 1000);
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(beforeAt.getTime() - 30 * 60 * 1000),
      endedAt: beforeAt,
      observations: [
        { skillId: mirrors.id, assessment: "needs_help", steps: [], observedAt: beforeAt },
      ],
    });
    const during = new Date(week.start.getTime() + 3 * 60 * 60 * 1000);
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(during.getTime() - 30 * 60 * 1000),
      endedAt: during,
      observations: [
        {
          skillId: mirrors.id,
          assessment: "independent",
          steps: ["before_slow", "before_turn", "behind"],
          observedAt: during,
        },
      ],
    });

    const summary = await getJourneyWeeklySummary(student.journey.id, week);
    assert.equal(summary?.progressionStart, readinessPercent(1, total * 3));
    assert.equal(summary?.progressionEnd, readinessPercent(3, total * 3));
    assert.notEqual(summary?.progressionStart, summary?.progressionEnd);
  });

  it("keeps an event on exactly one side of the week boundary", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const previous = await previousStockholmWeek(week);
    const next = await stockholmWeekContaining(week.end);
    const student = await createJourneyForStudent("Kim");
    const mirrors = await skill("observation_mirror_routine");
    const second = 1000;

    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() - 30 * 60 * second),
      endedAt: new Date(week.start.getTime() - second),
      observations: [
        {
          skillId: mirrors.id,
          assessment: "needs_help",
          steps: ["before_slow"],
          observedAt: new Date(week.start.getTime() - second),
        },
      ],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() - 20 * 60 * second),
      endedAt: week.start,
      observations: [
        {
          skillId: mirrors.id,
          assessment: "with_support",
          steps: ["before_slow", "before_turn"],
          observedAt: week.start,
        },
      ],
    });
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.end.getTime() - 20 * 60 * second),
      endedAt: week.end,
      observations: [
        {
          skillId: mirrors.id,
          assessment: "independent",
          steps: ["before_slow", "before_turn", "behind"],
          observedAt: week.end,
        },
      ],
    });

    const current = await getJourneyWeeklySummary(student.journey.id, week);
    const before = await getJourneyWeeklySummary(student.journey.id, previous);
    const after = await getJourneyWeeklySummary(student.journey.id, next);
    assert.equal(current?.completedDrives, 1);
    assert.equal(current?.trainedSkills, 1);
    assert.equal(before?.completedDrives, 1);
    assert.equal(before?.trainedSkills, 1);
    assert.equal(after?.completedDrives, 1);
    assert.equal(after?.trainedSkills, 1);
    assert.equal(
      (current?.completedDrives ?? 0) + (before?.completedDrives ?? 0) + (after?.completedDrives ?? 0),
      3,
    );
  });

  it("does not mail a journey with no activity, an open drive, or no address", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const quiet = await createJourneyForStudent("Tyst");
    await setEmail(quiet.userId, "tyst@example.com");
    const open = await createJourneyForStudent("Öppen");
    await setEmail(open.userId, "oppen@example.com");
    const mirrors = await skill("observation_mirror_routine");
    await insertDrive({
      journeyId: open.journey.id,
      actorId: open.userId,
      startedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
      endedAt: null,
      observations: [
        {
          skillId: mirrors.id,
          assessment: "needs_help",
          steps: ["before_slow"],
          observedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
        },
      ],
    });
    const noAddress = await createJourneyForStudent("Saknar");
    await insertDrive({
      journeyId: noAddress.journey.id,
      actorId: noAddress.userId,
      startedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 2 * 60 * 60 * 1000),
    });

    const run = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(sent.length, 0);
    assert.ok(run.decisions.every((decision) => decision.action === "skipped"));
    assert.ok(run.decisions.some((decision) => decision.reason === "no_activity" && decision.journeyId === quiet.journey.id));
    assert.ok(run.decisions.some((decision) => decision.reason === "no_activity" && decision.journeyId === open.journey.id));
    assert.ok(run.decisions.some((decision) => decision.reason === "missing_email"));
    const rows = await getPool().query(`SELECT 1 FROM journey_weekly_emails`);
    assert.equal(rows.rowCount, 0);

    const early = await stockholmCivil(2026, 10, 4, 17, 59);
    const active = await createJourneyForStudent("Tidig");
    await setEmail(active.userId, "tidig@example.com");
    await insertDrive({
      journeyId: active.journey.id,
      actorId: active.userId,
      startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
    });
    const tooEarly = await sendWeeklySummaryEmails({ now: early });
    assert.equal(tooEarly.skippedWindow, true);
    assert.equal(sent.length, 0);
  });

  it("skips deleted and suspended accounts and archived journeys", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const ended = new Date(week.start.getTime() + 2 * 60 * 60 * 1000);
    for (const [name, email, state] of [
      ["Borta", "borta@example.com", "deleted"],
      ["Paus", "paus@example.com", "suspended"],
    ] as const) {
      const student = await createJourneyForStudent(name);
      await setEmail(student.userId, email);
      await getPool().query(`UPDATE users SET account_state = $2 WHERE id = $1`, [student.userId, state]);
      await insertDrive({
        journeyId: student.journey.id,
        actorId: student.userId,
        startedAt: new Date(ended.getTime() - 30 * 60 * 1000),
        endedAt: ended,
      });
    }
    const archived = await createJourneyForStudent("Arkiv");
    await setEmail(archived.userId, "arkiv@example.com");
    await insertDrive({
      journeyId: archived.journey.id,
      actorId: archived.userId,
      startedAt: new Date(ended.getTime() - 30 * 60 * 1000),
      endedAt: ended,
    });
    await getPool().query(`UPDATE driving_journeys SET status = 'archived' WHERE id = $1`, [
      archived.journey.id,
    ]);

    const run = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(sent.length, 0);
    assert.equal(run.decisions.length, 0);
  });

  it("uses the sign-in address when no contact address is stored", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Google");
    await getPool().query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, email, email_normalized, verified_at)
       VALUES ($1, 'google', 'google-subject-1', 'google@example.com', 'google@example.com', now())`,
      [student.userId],
    );
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
    });
    await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "google@example.com");
  });

  it("does not send the same week twice and a retry does not duplicate a sent mail", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Idem");
    await setEmail(student.userId, "idem@example.com");
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 90 * 60 * 1000),
    });

    failFor = "idem@example.com";
    const failed = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(failed.decisions.filter((decision) => decision.action === "failed").length, 1);
    assert.equal(sent.length, 0);
    const failedRow = await getPool().query(`SELECT status FROM journey_weekly_emails`);
    assert.equal(failedRow.rows[0].status, "failed");

    failFor = null;
    const retried = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(retried.decisions.filter((decision) => decision.action === "sent").length, 1);
    assert.equal(sent.length, 1);

    const again = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(again.decisions[0]?.reason, "already_sent");
    assert.equal(sent.length, 1);
    const rows = await getPool().query(`SELECT status FROM journey_weekly_emails`);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].status, "sent");
  });

  it("leaves an in-progress claim unsent on the next run", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Lås");
    await setEmail(student.userId, "las@example.com");
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
    });
    await getPool().query(
      `INSERT INTO journey_weekly_emails (journey_id, account_id, week_key, template, status)
       VALUES ($1, $2, $3, 'weekly_summary', 'sending')`,
      [student.journey.id, student.userId, week.weekKey],
    );
    const run = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(run.decisions[0]?.reason, "in_progress");
    assert.equal(sent.length, 0);
  });

  it("keeps going when one recipient fails", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const first = await createJourneyForStudent("Ada");
    const second = await createJourneyForStudent("Bo");
    await setEmail(first.userId, "ada@example.com");
    await setEmail(second.userId, "bo@example.com");
    for (const student of [first, second]) {
      await insertDrive({
        journeyId: student.journey.id,
        actorId: student.userId,
        startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
        endedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
      });
    }
    failFor = "ada@example.com";
    const run = await sendWeeklySummaryEmails({ now: sunday });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "bo@example.com");
    assert.equal(run.decisions.filter((decision) => decision.action === "failed").length, 1);
    assert.equal(run.decisions.filter((decision) => decision.action === "sent").length, 1);
    const statuses = await getPool().query(
      `SELECT status FROM journey_weekly_emails ORDER BY status`,
    );
    assert.deepEqual(
      statuses.rows.map((row) => row.status),
      ["failed", "sent"],
    );
  });

  it("shows the latest weekly mail in admin without a send button", async () => {
    const sunday = await stockholmCivil(2026, 10, 4, 18, 0);
    const week = await stockholmWeekContaining(sunday);
    const student = await createJourneyForStudent("Nora");
    await setEmail(student.userId, "nora@example.com");
    await insertDrive({
      journeyId: student.journey.id,
      actorId: student.userId,
      startedAt: new Date(week.start.getTime() + 30 * 60 * 1000),
      endedAt: new Date(week.start.getTime() + 60 * 60 * 1000),
    });
    await sendWeeklySummaryEmails({ now: sunday });
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: `/admin/statistik/resa/${student.journey.id}`,
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /data-weekly-email/);
    const sectionStart = page.body.indexOf("<section data-weekly-email>");
    const section = page.body.slice(sectionStart, page.body.indexOf("</section>", sectionStart));
    assert.match(section, new RegExp(week.weekKey));
    assert.match(section, /Skickat/);
    assert.match(section, /weekly_summary/);
    assert.match(section, /skickas inte manuellt/i);
    assert.doesNotMatch(section, /<form|<button/i);
    assert.doesNotMatch(page.body, /nora@example.com/);
    await app.close();
  });
});
