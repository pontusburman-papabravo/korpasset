import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import {
  createDriveWithFocus,
  endDrive,
} from "../src/services/drives.js";
import {
  daysSinceDriveBucket,
  type ProductEventName,
} from "../src/services/product-events.js";
import {
  HANDOFF_COOKIE_MAX_AGE_SECONDS,
  HANDOFF_COOKIE_NAME,
} from "../src/http/handoff-context.js";
import { STUDENT_START_PATH } from "../src/http/onboarding-pages.js";
import { createTestApp } from "./helpers.js";
import {
  cookiesFromResponse,
  formBody,
  injectWithSession,
  mergeCookies,
} from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

async function eventsNamed(name: ProductEventName) {
  const result = await getPool().query(
    `SELECT event_name, journey_id, user_id, actor_role, event_source,
            practice_stage, days_since_drive_bucket
     FROM product_events
     WHERE event_name = $1
     ORDER BY created_at, id`,
    [name],
  );
  return result.rows;
}

describe("handoff and stale-drive observation", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("records student and supervisor role selection without PII", async () => {
    const student = await continueWithOAuth({
      provider: "apple",
      subject: "obs-role-student",
      displayName: "Ludvig",
    });
    const parent = await continueWithOAuth({
      provider: "google",
      subject: "obs-role-parent",
      displayName: "Jonas",
    });
    const app = await createTestApp();

    const studentChoice = await injectWithSession(app, session(student.userId), {
      method: "GET",
      url: "/onboarding?som=elev",
    });
    const parentChoice = await injectWithSession(app, session(parent.userId), {
      method: "GET",
      url: "/onboarding?som=handledare",
    });
    assert.equal(studentChoice.statusCode, 200);
    assert.equal(parentChoice.statusCode, 200);
    await app.close();

    const roles = await eventsNamed("onboarding_role_selected");
    assert.equal(roles.length, 2);
    assert.equal(roles[0].actor_role, "student");
    assert.equal(roles[0].event_source, "direct");
    assert.equal(roles[0].user_id, student.userId);
    assert.equal(roles[1].actor_role, "supervisor");
    assert.equal(roles[1].user_id, parent.userId);
    assert.equal(roles[1].event_source, null);
    const blob = JSON.stringify(roles);
    assert.equal(blob.includes("Ludvig"), false);
    assert.equal(blob.includes("Jonas"), false);
  });

  it("marks a parent-handoff journey as parent_handoff with practice_stage", async () => {
    const student = await continueWithOAuth({
      provider: "apple",
      subject: "obs-handoff-student",
      displayName: "Emma",
    });
    const app = await createTestApp();
    const handoff = await injectWithSession(app, session(student.userId), {
      method: "GET",
      url: STUDENT_START_PATH,
    });
    assert.equal(handoff.statusCode, 200);
    assert.equal(cookiesFromResponse(handoff)[HANDOFF_COOKIE_NAME], "parent");

    const started = await eventsNamed("student_handoff_started");
    assert.equal(started.length, 1);
    assert.equal(started[0].event_source, "parent_handoff");
    assert.equal(started[0].actor_role, "student");
    assert.equal(started[0].user_id, student.userId);
    assert.equal(started[0].journey_id, null);

    const created = await injectWithSession(
      app,
      mergeCookies(session(student.userId), handoff),
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Emma", practice_stage: "just_started" }),
      },
    );
    assert.equal(created.statusCode, 302);
    await app.close();

    const journeys = await eventsNamed("journey_created");
    assert.equal(journeys.length, 1);
    assert.equal(journeys[0].event_source, "parent_handoff");
    assert.equal(journeys[0].practice_stage, "just_started");
    assert.equal(journeys[0].user_id, student.userId);
    assert.ok(journeys[0].journey_id);
    assert.equal(JSON.stringify(journeys).includes("Emma"), false);
    assert.equal(created.cookies.some((cookie) => cookie.name === HANDOFF_COOKIE_NAME), true);
    assert.equal(HANDOFF_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 7);
  });

  it("does not classify a later start from via=handledare without the handoff cookie", async () => {
    const student = await continueWithOAuth({
      provider: "apple",
      subject: "obs-via-without-cookie",
      displayName: "Eva",
    });
    const app = await createTestApp();
    const opened = await injectWithSession(app, session(student.userId), {
      method: "GET",
      url: STUDENT_START_PATH,
    });
    assert.equal(opened.statusCode, 200);
    assert.equal((await eventsNamed("student_handoff_started")).length, 1);

    const created = await injectWithSession(app, session(student.userId), {
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Eva", practice_stage: "just_started" }),
    });
    assert.equal(created.statusCode, 302);
    await app.close();

    const journeys = await eventsNamed("journey_created");
    assert.equal(journeys.length, 1);
    assert.equal(journeys[0].event_source, "direct");
  });

  it("marks a direct student journey as direct with practice_stage", async () => {
    const student = await continueWithOAuth({
      provider: "apple",
      subject: "obs-direct-student",
      displayName: "Clara",
    });
    const app = await createTestApp();
    const form = await injectWithSession(app, session(student.userId), {
      method: "GET",
      url: "/onboarding?som=elev",
    });
    assert.equal(form.statusCode, 200);
    assert.equal(cookiesFromResponse(form)[HANDOFF_COOKIE_NAME], undefined);

    const created = await injectWithSession(app, session(student.userId), {
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Clara", practice_stage: "building" }),
    });
    assert.equal(created.statusCode, 302);
    await app.close();

    assert.equal((await eventsNamed("student_handoff_started")).length, 0);
    const journeys = await eventsNamed("journey_created");
    assert.equal(journeys.length, 1);
    assert.equal(journeys[0].event_source, "direct");
    assert.equal(journeys[0].practice_stage, "building");
  });

  it("emits stale_drive_nudge_shown with a bucketed gap", async () => {
    const { journey, userId } = await createJourneyForStudent(
      "Sabina",
      null,
      "near_test",
    );
    const invitation = await createInvitation(journey.id, userId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const endedAt = new Date();
    endedAt.setDate(endedAt.getDate() - 8);
    await getPool().query(
      `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [journey.id, userId, supervisor.userId, endedAt.toISOString()],
    );

    const app = await createTestApp();
    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(home.statusCode, 200);
    await app.close();

    const shown = await eventsNamed("stale_drive_nudge_shown");
    assert.equal(shown.length, 1);
    assert.equal(shown[0].journey_id, journey.id);
    assert.equal(shown[0].practice_stage, "near_test");
    assert.equal(shown[0].days_since_drive_bucket, "8-14");
    assert.equal(shown[0].actor_role, "student");
    assert.equal(daysSinceDriveBucket(8), "8-14");
    assert.equal(JSON.stringify(shown).includes("Sabina"), false);

    const again = await createTestApp();
    const refresh = await injectWithSession(again, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(refresh.statusCode, 200);
    await again.close();
    assert.equal((await eventsNamed("stale_drive_nudge_shown")).length, 2);
  });

  it("buckets stale-drive days at the documented boundaries", () => {
    assert.equal(daysSinceDriveBucket(5), "5-7");
    assert.equal(daysSinceDriveBucket(7), "5-7");
    assert.equal(daysSinceDriveBucket(8), "8-14");
    assert.equal(daysSinceDriveBucket(14), "8-14");
    assert.equal(daysSinceDriveBucket(15), "15-30");
    assert.equal(daysSinceDriveBucket(30), "15-30");
    assert.equal(daysSinceDriveBucket(31), "31+");
  });

  it("keeps pre-migration journey_created rows valid with NULL source", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    await getPool().query(
      `INSERT INTO product_events (event_name, journey_id, user_id, actor_role)
       VALUES ('journey_created', $1, $2, 'student')`,
      [journey.id, userId],
    );
    const legacy = await getPool().query(
      `SELECT event_source, practice_stage, days_since_drive_bucket
       FROM product_events
       WHERE journey_id = $1 AND event_source IS NULL`,
      [journey.id],
    );
    assert.equal(legacy.rows.length, 1);
    assert.equal(legacy.rows[0].event_source, null);
    assert.equal(legacy.rows[0].practice_stage, null);
    assert.equal(legacy.rows[0].days_since_drive_bucket, null);

    const created = await eventsNamed("journey_created");
    const withSource = created.filter((row) => row.event_source !== null);
    assert.equal(withSource.length, 1);
    assert.equal(withSource[0].event_source, "direct");
    assert.equal(withSource[0].practice_stage, "unknown");
  });

  it("keeps drive_started on a normal new drive", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, userId);
    await acceptInvitation(invitation.token, "Pappa", null);
    const skills = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 2`,
    );
    const created = await createDriveWithFocus(
      journey.id,
      userId,
      skills.rows.map((row) => row.id as string),
    );
    await endDrive(journey.id, created.drive.id, userId);

    const started = await getPool().query(
      `SELECT event_name, journey_id, focus_skill_count
       FROM product_events
       WHERE journey_id = $1 AND event_name IN ('drive_focus_saved', 'drive_started', 'drive_completed')
       ORDER BY event_name`,
      [journey.id],
    );
    assert.deepEqual(
      started.rows.map((row) => row.event_name),
      ["drive_completed", "drive_focus_saved", "drive_started"],
    );
    assert.equal(started.rows[0].journey_id, journey.id);
    assert.equal(Number(started.rows[1].focus_skill_count), 2);
  });
});
