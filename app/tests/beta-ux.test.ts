import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { actorDisplayName } from "../src/services/actor-display.js";
import {
  createDriveWithFocus,
  endDrive,
  getLatestEndedDrive,
} from "../src/services/drives.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import {
  createJourneyForStudent,
  updateTransmissionScope,
} from "../src/services/journeys.js";
import { saveDriveObservations } from "../src/services/observations.js";
import {
  formatDay,
  isSkillNotApplicable,
  listAreaProgress,
  listJourneyReadiness,
  listSkillProgress,
  readinessPercent,
  skillProgressLabel,
} from "../src/services/progression.js";
import { recommendNextFocus } from "../src/services/recommendations.js";
import {
  type OutboundEmail,
  setMailerForTests,
} from "../src/services/email.js";
import { FEEDBACK_RATE_LIMIT } from "../src/http/help.js";
import { resetRateLimitsForTests } from "../src/http/rate-limit.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

async function setupRatedJourney() {
  const { journey, userId: studentId } = await createJourneyForStudent("Ella");
  const invitation = await createInvitation(journey.id, studentId);
  const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
  const skills = await getPool().query(
    `SELECT id FROM skills ORDER BY skill_key LIMIT 3`,
  );
  const skillIds = skills.rows.map((row) => row.id as string);
  const { drive } = await createDriveWithFocus(journey.id, studentId, skillIds);
  await endDrive(journey.id, drive.id, studentId);
  await saveDriveObservations(journey.id, drive.id, supervisor.userId, [
    { skillId: skillIds[0], assessment: "needs_help" },
    { skillId: skillIds[1], assessment: "with_support" },
    { skillId: skillIds[2], assessment: "independent" },
  ]);
  return { journey, studentId, supervisor, skillIds, drive };
}

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("actor display names", () => {
  it("falls back for missing and deleted actors", () => {
    assert.equal(actorDisplayName("Pappa", "active", "supervisor"), "Pappa");
    assert.equal(actorDisplayName(null, "guest", "supervisor"), "Handledare");
    assert.equal(actorDisplayName("Ella", "deleted", "student"), "Tidigare elev");
    assert.equal(
      actorDisplayName("Pappa", "deleted", "supervisor"),
      "Tidigare handledare",
    );
  });
});

describe("progression read model", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("treats gear shifting as not applicable for automatic journeys", () => {
    assert.equal(isSkillNotApplicable("car_control_gear_shifting", "automatic_only"), true);
    assert.equal(isSkillNotApplicable("car_control_gear_shifting", "manual"), false);
    assert.equal(isSkillNotApplicable("mirrors", "automatic_only"), false);
  });

  it("summarises trained skills with readiness percent per area and total", async () => {
    const { journey } = await setupRatedJourney();
    const areas = await listAreaProgress(journey.id);
    const trained = areas.reduce((sum, area) => sum + area.trainedCount, 0);
    assert.equal(trained, 3);
    assert.ok(areas.every((area) => !/%|redo|godkänd/i.test(area.areaTitle)));
    const readiness = await listJourneyReadiness(journey.id);
    assert.equal(readiness.trainedCount, 3);
    assert.equal(readiness.scored, 1 + 2 + 3);
    assert.equal(readiness.max, readiness.skillCount * 3);
    assert.equal(readiness.percent, readinessPercent(readiness.scored, readiness.max));
    assert.ok(readiness.areas.some((area) => area.readinessPercent > 0));
    assert.ok(readiness.areas.every((area) => area.max === area.skillCount * 3));
    const labels = (await listSkillProgress(journey.id)).map(skillProgressLabel);
    assert.ok(labels.includes("Behöver hjälp"));
    assert.ok(labels.includes("Med påminnelse"));
    assert.ok(labels.includes("Utan hjälp"));
    assert.ok(labels.includes("Inte tränat ännu"));
    assert.ok(formatDay(new Date("2026-03-04T12:00:00Z")));
  });

  it("marks gear shifting as not applicable after automatic transmission", async () => {
    const { journey, studentId } = await setupRatedJourney();
    await updateTransmissionScope(journey.id, studentId, "automatic_only");
    const progress = await listSkillProgress(journey.id);
    const gear = progress.find((skill) => skill.skillKey === "car_control_gear_shifting");
    assert.ok(gear);
    assert.equal(gear.notApplicable, true);
    assert.equal(skillProgressLabel(gear), "Gäller inte automat");
    const areas = await listAreaProgress(journey.id);
    const carControl = areas.find((area) => area.areaKey === gear.areaKey);
    assert.ok(carControl);
    assert.equal(
      carControl.skillCount,
      progress.filter((skill) => skill.areaKey === gear.areaKey && !skill.notApplicable)
        .length,
    );
  });
});

describe("beta UX HTTP", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  afterEach(() => {
    setMailerForTests(null);
    delete process.env.RESEND_API_KEY;
  });

  it("renders student and supervisor journey homes", async () => {
    const { journey, studentId, supervisor, drive } = await setupRatedJourney();
    const app = await createTestApp();

    const studentHome = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(studentHome.statusCode, 200);
    assert.match(studentHome.body, /Min körkortsresa/);
    assert.match(studentHome.body, /Nästa körpass/);
    assert.match(studentHome.body, /Senaste körpasset/);
    assert.match(studentHome.body, /Pappa/);
    assert.match(studentHome.body, /Utveckling/);
    assert.match(studentHome.body, /Mina handledare/);
    assert.match(studentHome.body, /Kör pappa, mamma, partner eller ett syskon också/);
    assert.match(studentHome.body, /Växellåda/);
    assert.match(studentHome.body, /Nästa gång/);
    assert.match(studentHome.body, /Så gick det/);
    assert.match(studentHome.body, /app-tabbar/);
    assert.match(studentHome.body, /Så här ligger ni till/);
    assert.match(studentHome.body, /Handledarguiden/);
    assert.match(studentHome.body, /href="\/journey\/[^"]+\/guide"/);
    assert.match(studentHome.body, /Totalt läge/);
    assert.match(studentHome.body, /\d+%/);
    assert.doesNotMatch(studentHome.body, /uppkörningsklar|Godkänd/);
    assert.match(studentHome.body, /href="\/hjalp"/);

    const supervisorHome = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(supervisorHome.statusCode, 200);
    assert.match(supervisorHome.body, /Du är handledare/);
    assert.match(supervisorHome.body, /Dagens fokus/);
    assert.match(supervisorHome.body, /Handledarguiden/);
    assert.doesNotMatch(supervisorHome.body, /Växellåda/);
    assert.match(supervisorHome.body, new RegExp(`/drive/${drive.id}/done`));

    await app.close();
  });

  it("lets the assigned supervisor rate from the journey home", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const skills = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 2`,
    );
    const skillIds = skills.rows.map((row) => row.id as string);
    const { drive } = await createDriveWithFocus(journey.id, studentId, skillIds);
    await endDrive(journey.id, drive.id, studentId);

    const latest = await getLatestEndedDrive(journey.id);
    assert.ok(latest);
    assert.equal(latest.rated, false);
    assert.equal(latest.supervisorLabel, "Pappa");

    const app = await createTestApp();
    const supervisorHome = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(supervisorHome.body, /Bedöm senaste körpasset/);
    assert.match(supervisorHome.body, new RegExp(`/drive/${drive.id}/rate`));

    const studentHome = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(studentHome.body, /Väntar på bedömning från Pappa/);
    await app.close();
  });

  it("lets the supervisor add a live note during the drive", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const skills = await getPool().query(
      `SELECT id, skill_key FROM skills
       WHERE skill_key IN ('positioning_lane_change', 'observation_signaling')
       ORDER BY skill_key`,
    );
    const skillIds = skills.rows.map((row) => row.id as string);
    const { drive } = await createDriveWithFocus(journey.id, studentId, skillIds);

    const app = await createTestApp();
    const supervisorDrive = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/${drive.id}`,
    });
    assert.equal(supervisorDrive.statusCode, 200);
    assert.match(supervisorDrive.body, /Körpass pågår/);
    assert.match(supervisorDrive.body, /Notera hur det går när det är säkert/);
    assert.match(supervisorDrive.body, /Steg att öva/);
    assert.match(supervisorDrive.body, /Tips\./);
    assert.match(supervisorDrive.body, /Fråga\./);
    assert.match(supervisorDrive.body, /Spegel/);
    assert.match(supervisorDrive.body, /Blinkers/);
    assert.match(supervisorDrive.body, /type="checkbox"/);
    assert.match(supervisorDrive.body, /Kort anteckning/);
    assert.match(
      supervisorDrive.body,
      new RegExp(`/journey/${journey.id}/drive/${drive.id}/observe`),
    );

    const laneChange = skills.rows.find((row) => row.skill_key === "positioning_lane_change");
    assert.ok(laneChange);
    const observed = await injectWithSession(app, session(supervisor.userId), {
      method: "POST",
      url: `/journey/${journey.id}/drive/${drive.id}/observe`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        skill_id: String(laneChange.id),
        assessment: "needs_help",
        note: "Stannade för sent vid övergångsstället",
        completed_steps: ["mirror", "signal"],
      }),
    });
    assert.equal(observed.statusCode, 302);
    assert.equal(observed.headers.location, `/journey/${journey.id}/drive/${drive.id}`);

    const studentDrive = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/${drive.id}`,
    });
    assert.match(studentDrive.body, /Behöver hjälp/);
    assert.match(studentDrive.body, /Stannade för sent vid övergångsstället/);
    assert.match(studentDrive.body, /Spegel/);
    assert.match(studentDrive.body, /Blinkers/);

    await endDrive(journey.id, drive.id, studentId);
    const recap = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/${drive.id}/done`,
    });
    assert.match(recap.body, /Stannade för sent vid övergångsstället/);
    await app.close();
  });

  it("shows development per skill and saves transmission", async () => {
    const { journey, studentId, supervisor } = await setupRatedJourney();
    const app = await createTestApp();

    const page = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/utveckling`,
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Utveckling/);
    assert.match(page.body, /Så här ligger ni till/);
    assert.match(page.body, /Totalt läge/);
    assert.match(page.body, /\d+%/);
    assert.match(page.body, /Behöver hjälp/);
    assert.match(page.body, /Inte tränat ännu/);
    assert.match(page.body, /\/guide\//);
    assert.doesNotMatch(page.body, /uppkörningsklar|Godkänd/);

    const saved = await injectWithSession(app, session(studentId), {
      method: "POST",
      url: `/journey/${journey.id}/transmission`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ transmission_scope: "automatic_only" }),
    });
    assert.equal(saved.statusCode, 302);
    assert.equal(saved.headers.location, `/journey/${journey.id}`);

    const forbidden = await injectWithSession(app, session(supervisor.userId), {
      method: "POST",
      url: `/journey/${journey.id}/transmission`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ transmission_scope: "manual" }),
    });
    assert.equal(forbidden.statusCode, 403);

    const development = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/utveckling`,
    });
    assert.match(development.body, /Gäller inte automat/);

    const gear = await getPool().query(
      `SELECT id FROM skills WHERE skill_key = 'car_control_gear_shifting'`,
    );
    const focusPage = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/new`,
    });
    assert.doesNotMatch(focusPage.body, new RegExp(gear.rows[0].id));
    await app.close();
  });

  it("renders the supervisor guide for journey members", async () => {
    const { journey, studentId, supervisor } = await setupRatedJourney();
    const outsider = await createJourneyForStudent("Kim");
    const app = await createTestApp();

    const index = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/guide`,
    });
    assert.equal(index.statusCode, 200);
    assert.match(index.body, /<h1>Handledarguiden<\/h1>/);
    assert.match(index.body, /Före körpasset/);
    assert.match(index.body, /Under körpasset/);
    assert.match(index.body, /Efter körpasset/);
    assert.match(index.body, /Säkerhetskontroll/);
    assert.match(index.body, /Planera övningskörningen/);
    assert.doesNotMatch(index.body, /Handledarboken|Körkortsboken/);
    assert.doesNotMatch(index.body, /uppkörningsklar|Godkänd/);

    const skill = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}/guide/roundabout_entry`,
    });
    assert.equal(skill.statusCode, 200);
    assert.match(skill.body, /Infart i rondell/);
    assert.match(skill.body, /Titta efter/);
    assert.match(skill.body, /Så coachar du/);
    assert.match(skill.body, /Fråga eleven/);
    assert.match(skill.body, /Steg att öva/);
    assert.match(skill.body, /Ta med i nästa körpass/);

    const missing = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/guide/not_a_skill`,
    });
    assert.equal(missing.statusCode, 404);

    const forbidden = await injectWithSession(app, session(outsider.userId), {
      method: "GET",
      url: `/journey/${journey.id}/guide`,
    });
    assert.equal(forbidden.statusCode, 403);
    await app.close();
  });

  it("preselects recommended skills on drive focus", async () => {
    const { journey, studentId } = await setupRatedJourney();
    const recommendations = await recommendNextFocus(journey.id);
    assert.ok(recommendations.length >= 2);

    const app = await createTestApp();
    const page = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/new`,
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, new RegExp(`${recommendations.length} av 3 valda`));
    for (const rec of recommendations) {
      assert.match(
        page.body,
        new RegExp(`value="${rec.skillId}" checked`),
      );
    }
    assert.match(page.body, /Så tränar ni/);
    assert.match(page.body, /\/guide\//);
    await app.close();
  });

  it("lets the user edit their display name", async () => {
    const { userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const page = await injectWithSession(app, session(userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(page.body, /action="\/konto\/namn"/);
    assert.match(page.body, /value="Ella"/);
    assert.match(page.body, /href="\/radera-konto"/);
    assert.match(page.body, /Radera mitt konto/);

    const saved = await injectWithSession(app, session(userId), {
      method: "POST",
      url: "/konto/namn",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Ella B" }),
    });
    assert.equal(saved.statusCode, 302);
    assert.equal(saved.headers.location, "/konto");

    const updated = await injectWithSession(app, session(userId), {
      method: "GET",
      url: "/konto",
    });
    assert.match(updated.body, /value="Ella B"/);

    const empty = await injectWithSession(app, session(userId), {
      method: "POST",
      url: "/konto/namn",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "   " }),
    });
    assert.equal(empty.statusCode, 400);
    await app.close();
  });

  it("accepts in-app help and client-error beacons", async () => {
    const sent: OutboundEmail[] = [];
    setMailerForTests({
      async send(email) {
        sent.push(email);
      },
    });
    process.env.RESEND_API_KEY = "test-resend";
    const { userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();

    const help = await app.inject({ method: "GET", url: "/hjalp" });
    assert.equal(help.statusCode, 200);
    assert.match(help.body, /<h1>Hjälp<\/h1>/);
    assert.match(help.body, /handledarguiden/);
    assert.match(help.body, /\/api\/client-error/);

    const posted = await injectWithSession(app, session(userId), {
      method: "POST",
      url: "/hjalp",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        topic: "drive_focus",
        message: "Kunde inte välja dagens fokus.",
      }),
    });
    assert.equal(posted.statusCode, 200);
    assert.match(posted.body, /Tack — vi har tagit emot det/);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Välja dagens fokus/);
    assert.match(sent[0].text, new RegExp(userId));

    const invalid = await app.inject({
      method: "POST",
      url: "/hjalp",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ topic: "other", message: "hej" }),
    });
    assert.equal(invalid.statusCode, 400);

    const beacon = await app.inject({
      method: "POST",
      url: "/api/client-error",
      headers: { "content-type": "application/json" },
      payload: { message: "boom", path: "/invite/secret-token" },
    });
    assert.equal(beacon.statusCode, 204);

    resetRateLimitsForTests();
    let lastStatus = 0;
    for (let i = 0; i < FEEDBACK_RATE_LIMIT.limit + 1; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/hjalp",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({
          topic: "other",
          message: "Det här är mer feedback från betan.",
        }),
      });
      lastStatus = response.statusCode;
    }
    assert.equal(lastStatus, 429);
    await app.close();
  });

  it("asks students to invite any supervisor, not only the first one", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(home.body, /Bjud in mamma, pappa, partner eller den som kör med er/);
    await app.close();
  });

  it("recommends unobserved core skills as next practice, not beginner-only", async () => {
    const { journey } = await createJourneyForStudent("Ella");
    const recommendations = await recommendNextFocus(journey.id);
    assert.ok(recommendations.length >= 1);
    assert.equal(recommendations[0].reason, "core_unobserved");
    assert.equal(recommendations[0].message, "Värt att ta nästa gång");
  });
});
