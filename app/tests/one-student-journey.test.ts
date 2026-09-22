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
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("one active student-owned B journey (users-and-progress)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("creates the first student journey", async () => {
    const created = await createJourneyForStudent("Ella");
    assert.equal(created.journey.studentUserId, created.userId);
    assert.equal(created.journey.licenceType, "B");
    assert.equal(created.journey.status, "active");
    const count = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys WHERE student_user_id = $1`,
      [created.userId],
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("rejects a second active student journey for the same person", async () => {
    const first = await createJourneyForStudent("Ella");
    await assert.rejects(
      () => createJourneyForStudent("Ella", first.userId),
      (error: Error & { code?: string; statusCode?: number }) =>
        error.code === "active_student_journey_exists" && error.statusCode === 409,
    );
    const count = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys WHERE student_user_id = $1`,
      [first.userId],
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("allows a new active journey after the previous one is completed or archived", async () => {
    const completedOwner = await createJourneyForStudent("Ella");
    await getPool().query(
      `UPDATE driving_journeys SET status = 'completed' WHERE id = $1`,
      [completedOwner.journey.id],
    );
    const afterCompleted = await createJourneyForStudent(
      "Ella",
      completedOwner.userId,
    );
    assert.equal(afterCompleted.userId, completedOwner.userId);
    assert.equal(afterCompleted.journey.status, "active");
    assert.notEqual(afterCompleted.journey.id, completedOwner.journey.id);

    const archivedOwner = await createJourneyForStudent("Clara");
    await getPool().query(
      `UPDATE driving_journeys SET status = 'archived' WHERE id = $1`,
      [archivedOwner.journey.id],
    );
    const afterArchived = await createJourneyForStudent(
      "Clara",
      archivedOwner.userId,
    );
    assert.equal(afterArchived.userId, archivedOwner.userId);
    assert.equal(afterArchived.journey.status, "active");
  });

  it("lets the same person supervise several other journeys", async () => {
    const supervisor = await continueWithOAuth({
      provider: "apple",
      subject: "apple-multi-supervisor",
      displayName: "Pappa",
    });
    const owned = await createJourneyForStudent("Pappa", supervisor.userId);
    const clara = await createJourneyForStudent("Clara");
    const ella = await createJourneyForStudent("Ella");
    const claraInvite = await createInvitation(clara.journey.id, clara.userId);
    const ellaInvite = await createInvitation(ella.journey.id, ella.userId);
    await acceptInvitation(claraInvite.token, "Pappa", supervisor.userId);
    await acceptInvitation(ellaInvite.token, "Pappa", supervisor.userId);

    const collab = await getPool().query(
      `SELECT journey_id FROM journey_collaborators
       WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
      [supervisor.userId],
    );
    assert.equal(collab.rowCount, 2);
    const ownedCount = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys
       WHERE student_user_id = $1 AND status = 'active'`,
      [supervisor.userId],
    );
    assert.equal(ownedCount.rows[0].n, 1);
    assert.equal(owned.journey.studentUserId, supervisor.userId);
  });

  it("does not let two concurrent creates produce two active student journeys", async () => {
    const apple = await continueWithOAuth({
      provider: "google",
      subject: "google-concurrent-journey",
      displayName: "Ella",
    });
    const results = await Promise.allSettled([
      createJourneyForStudent("Ella", apple.userId),
      createJourneyForStudent("Ella", apple.userId),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ userId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const error = rejected[0].reason as Error & {
      code?: string;
      statusCode?: number;
    };
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "active_student_journey_exists");

    const count = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys
       WHERE student_user_id = $1 AND status = 'active' AND licence_type = 'B'`,
      [apple.userId],
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("returns 409 from POST /start when the active user already has a journey", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-http-second-journey",
      displayName: "Ella",
    });
    await createJourneyForStudent("Ella", apple.userId);
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      },
    );
    assert.equal(response.statusCode, 409);
    assert.match(response.body, /Du har redan en aktiv körkortsresa/);
    await app.close();
  });

  it("enforces the unique index in the database", async () => {
    const guest = await createGuestUser("Ella");
    await getPool().query(
      `INSERT INTO driving_journeys (student_user_id, licence_type, transmission_scope)
       VALUES ($1, 'B', 'unknown')`,
      [guest.id],
    );
    await assert.rejects(
      () =>
        getPool().query(
          `INSERT INTO driving_journeys (student_user_id, licence_type, transmission_scope)
           VALUES ($1, 'B', 'unknown')`,
          [guest.id],
        ),
      (error: Error & { code?: string; constraint?: string }) =>
        error.code === "23505" &&
        error.constraint === "driving_journeys_one_active_student_b",
    );
  });
});
