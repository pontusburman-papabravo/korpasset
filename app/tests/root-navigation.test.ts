import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { createSessionToken } from "../src/auth/session.js";
import {
  formatAccessibleJourneyLabel,
  listAccessibleActiveJourneys,
  resolveHomeJourneyId,
  createJourneyForStudent,
} from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

async function addSupervisor(
  studentJourneyId: string,
  studentId: string,
  supervisorName: string,
  sessionUserId: string | null = null,
) {
  const invitation = await createInvitation(studentJourneyId, studentId);
  return acceptInvitation(invitation.token, supervisorName, sessionUserId);
}

describe("app navigation (GET /app)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("redirects student with 0 journeys to onboarding", async () => {
    const app = await createTestApp();
    const user = await createGuestUser("Ella");

    const journeys = await listAccessibleActiveJourneys(user.id);
    assert.equal(journeys.length, 0);
    assert.equal(await resolveHomeJourneyId(user.id), null);

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(user.id),
    }, {
      method: "GET",
      url: "/app",
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");
    await app.close();
  });

  it("redirects student with 1 journey to that journey", async () => {
    const app = await createTestApp();
    const { journey, userId } = await createJourneyForStudent("Ella");

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(userId),
    }, {
      method: "GET",
      url: "/app",
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, `/journey/${journey.id}`);
    await app.close();
  });

  it("redirects supervisor with one active collaboration to supervised journey", async () => {
    const app = await createTestApp();
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const accepted = await addSupervisor(journey.id, studentId, "Pappa");

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(accepted.userId),
    }, {
      method: "GET",
      url: "/app",
    });

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, `/journey/${journey.id}`);
    await app.close();
  });

  it("shows selector for supervisor with two collaborator journeys", async () => {
    const app = await createTestApp();
    const clara = await createJourneyForStudent("Clara");
    const ella = await createJourneyForStudent("Ella");
    const accepted = await addSupervisor(clara.journey.id, clara.userId, "Pappa");
    await addSupervisor(ella.journey.id, ella.userId, "Pappa", accepted.userId);

    const journeys = await listAccessibleActiveJourneys(accepted.userId);
    assert.equal(journeys.length, 2);

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(accepted.userId),
    }, {
      method: "GET",
      url: "/app",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<h1>Välj elev<\/h1>/);
    assert.match(response.body, /Vilken körkortsresa vill du öppna\?/);
    assert.match(response.body, /Clara/);
    assert.match(response.body, /Ella/);
    assert.match(response.body, new RegExp(`/journey/${clara.journey.id}`));
    assert.match(response.body, new RegExp(`/journey/${ella.journey.id}`));
    assert.doesNotMatch(response.body, /Starta körpass/);
    assert.doesNotMatch(response.body, /Vad tränar ni/);
    await app.close();
  });

  it("shows selector for user who owns one journey and supervises another", async () => {
    const app = await createTestApp();
    const owned = await createJourneyForStudent("Ella");
    const other = await createJourneyForStudent("Clara");
    await addSupervisor(other.journey.id, other.userId, "Ella", owned.userId);

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(owned.userId),
    }, {
      method: "GET",
      url: "/app",
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Välj elev/);
    assert.match(response.body, /Ella/);
    assert.match(response.body, /Clara/);
    await app.close();
  });

  it("does not count removed collaborator", async () => {
    const { journey } = await createJourneyForStudent("Ella");
    const supervisor = await createGuestUser("Pappa");

    await getPool().query(
      `INSERT INTO journey_collaborators (journey_id, user_id, role, status)
       VALUES ($1, $2, 'supervisor', 'removed')`,
      [journey.id, supervisor.id],
    );

    assert.equal(await resolveHomeJourneyId(supervisor.id), null);
    const journeys = await listAccessibleActiveJourneys(supervisor.id);
    assert.equal(journeys.length, 0);

    const app = await createTestApp();
    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(supervisor.id),
    }, {
      method: "GET",
      url: "/app",
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");
    await app.close();
  });

  it("does not count archived or completed journeys as accessible", async () => {
    const archived = await createJourneyForStudent("Ella");
    await getPool().query(
      `UPDATE driving_journeys SET status = 'archived' WHERE id = $1`,
      [archived.journey.id],
    );

    const completed = await createJourneyForStudent("Clara");
    await getPool().query(
      `UPDATE driving_journeys SET status = 'completed' WHERE id = $1`,
      [completed.journey.id],
    );

    assert.equal((await listAccessibleActiveJourneys(archived.userId)).length, 0);
    assert.equal((await listAccessibleActiveJourneys(completed.userId)).length, 0);
    assert.equal(await resolveHomeJourneyId(archived.userId), null);

    const app = await createTestApp();
    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(archived.userId),
    }, {
      method: "GET",
      url: "/app",
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");
    await app.close();
  });

  it("does not count driving_instructor as supervisor for home redirect", async () => {
    const { journey } = await createJourneyForStudent("Ella");
    const instructor = await createGuestUser("Instruktör");

    await getPool().query(
      `INSERT INTO journey_collaborators (journey_id, user_id, role, status)
       VALUES ($1, $2, 'driving_instructor', 'active')`,
      [journey.id, instructor.id],
    );

    assert.equal(await resolveHomeJourneyId(instructor.id), null);

    const app = await createTestApp();
    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(instructor.id),
    }, {
      method: "GET",
      url: "/app",
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");
    await app.close();
  });

  it("shows the marketing homepage to anonymous users", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Övningskörning med bättre koll/);
    assert.match(response.body, /Bli betatestare/);

    const onboarding = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(onboarding.statusCode, 200);
    assert.match(onboarding.body, /Vad heter du/);
    assert.match(onboarding.body, /Starta min körkortsresa/);
    await app.close();
  });

  it("shows last drive date as secondary selector info when present", async () => {
    const app = await createTestApp();
    const clara = await createJourneyForStudent("Clara");
    const ella = await createJourneyForStudent("Ella");
    const accepted = await addSupervisor(clara.journey.id, clara.userId, "Pappa");
    await addSupervisor(ella.journey.id, ella.userId, "Pappa", accepted.userId);

    await getPool().query(
      `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at)
       VALUES ($1, $2, $3, '2026-09-14T10:00:00Z', '2026-09-14T11:00:00Z')`,
      [clara.journey.id, clara.userId, accepted.userId],
    );

    const journeys = await listAccessibleActiveJourneys(accepted.userId);
    const claraRow = journeys.find((row) => row.id === clara.journey.id);
    assert.ok(claraRow);
    assert.match(
      formatAccessibleJourneyLabel(claraRow),
      /Clara — senast körd 14 sep/i,
    );

    const response = await injectWithSession(app, {
      bilklar_session: createSessionToken(accepted.userId),
    }, {
      method: "GET",
      url: "/app",
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Clara — senast körd 14 sep/i);
    await app.close();
  });
});
