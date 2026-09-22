import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import {
  createJourneyForStudent,
  formatAccessibleJourneyLabel,
} from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { recommendNextFocus } from "../src/services/recommendations.js";
import { daysSince, formatDaysSince, STALE_DRIVE_DAYS } from "../src/services/progression.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("waitlist-driven product updates", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("splits empty onboarding so parents do not become the student", async () => {
    const app = await createTestApp();
    const chooser = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(chooser.statusCode, 200);
    assert.match(chooser.body, /Hur är du med i övningskörningen/);
    assert.match(chooser.body, /Jag tar körkort/);
    assert.match(chooser.body, /Jag är handledare eller förälder/);
    assert.doesNotMatch(chooser.body, /Starta min körkortsresa/);

    const supervisor = await app.inject({
      method: "GET",
      url: "/onboarding?som=handledare",
    });
    assert.match(supervisor.body, /Få in den som tar körkort/);
    assert.match(supervisor.body, /två barn/);
    assert.match(supervisor.body, /onboarding\?som=elev/);
    assert.doesNotMatch(supervisor.body, /action="\/start"/);

    const student = await app.inject({ method: "GET", url: "/onboarding?som=elev" });
    assert.match(student.body, /Starta min körkortsresa/);
    assert.match(student.body, /practice_stage/);
    await app.close();
  });

  it("stores practice stage when a student starts a journey", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-stage",
      displayName: "Ludvig",
    });
    const app = await createTestApp();
    const response = await injectWithSession(app, session(apple.userId), {
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Ludvig", practice_stage: "building" }),
    });
    assert.equal(response.statusCode, 302);
    const location = String(response.headers.location);
    const journeyId = location.slice("/journey/".length);
    const row = await getPool().query(
      `SELECT practice_stage FROM driving_journeys WHERE id = $1`,
      [journeyId],
    );
    assert.equal(row.rows[0].practice_stage, "building");
    await app.close();
  });

  it("suggests later-stage core skills when the family has already been driving", async () => {
    const beginner = await createJourneyForStudent("Ludvig", null, "just_started");
    const mid = await createJourneyForStudent("Eva", null, "building");
    const near = await createJourneyForStudent("Emma", null, "near_test");

    const beginnerRecs = await recommendNextFocus(beginner.journey.id);
    const midRecs = await recommendNextFocus(mid.journey.id);
    const nearRecs = await recommendNextFocus(near.journey.id);

    assert.ok(beginnerRecs.length >= 3);
    assert.ok(beginnerRecs[0]?.skillKey.startsWith("car_control_"));
    assert.ok(midRecs[0]?.skillKey.startsWith("intersections_"));
    assert.ok(nearRecs[0]?.skillKey.startsWith("independent_"));
    assert.notEqual(beginnerRecs[0]?.skillKey, midRecs[0]?.skillKey);
  });

  it("nudges families when it has been several days since the last drive", async () => {
    const { journey, userId } = await createJourneyForStudent("Jonas");
    const invitation = await createInvitation(journey.id, userId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa");
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
    assert.match(home.body, /Senaste körpasset/);
    assert.match(home.body, /sedan ni körde/);
    assert.match(home.body, /En kort runda räcker/);
    assert.doesNotMatch(home.body, /Dags att komma ut/);
    await app.close();
  });

  it("lets the student update practice stage from the journey home", async () => {
    const { journey, userId } = await createJourneyForStudent("Sabina");
    const app = await createTestApp();
    const update = await injectWithSession(app, session(userId), {
      method: "POST",
      url: `/journey/${journey.id}/practice-stage`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ practice_stage: "near_test" }),
    });
    assert.equal(update.statusCode, 302);

    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(home.body, /Nära uppkörning/);
    await app.close();
  });

  it("labels the viewer's own journey as Min körkortsresa in the picker", async () => {
    const owned = await createJourneyForStudent("Sabina");
    const other = await createJourneyForStudent("Clara");
    const label = formatAccessibleJourneyLabel(
      {
        id: owned.journey.id,
        studentUserId: owned.userId,
        studentName: "Sabina",
        lastDriveAt: null,
      },
      owned.userId,
    );
    assert.equal(label, "Min körkortsresa");
    const otherLabel = formatAccessibleJourneyLabel(
      {
        id: other.journey.id,
        studentUserId: other.userId,
        studentName: "Clara",
        lastDriveAt: null,
      },
      owned.userId,
    );
    assert.equal(otherLabel, "Clara");
  });

  it("counts calendar days since the last drive", () => {
    const then = new Date("2026-09-14T22:00:00Z");
    const now = new Date("2026-09-22T08:00:00Z");
    assert.equal(daysSince(then, now) >= STALE_DRIVE_DAYS, true);
    assert.equal(formatDaysSince(1), "1 dag");
    assert.equal(formatDaysSince(8), "8 dagar");
  });
});
