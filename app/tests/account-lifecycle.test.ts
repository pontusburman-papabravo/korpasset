import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { getJourneyAccess } from "../src/services/authorization.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import {
  listAccessibleActiveJourneys,
  listActiveSupervisors,
} from "../src/services/journeys.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  deleteProductAccount,
} from "../src/services/account-lifecycle.js";
import { getLatestEndedDrive } from "../src/services/drives.js";
import { recordProductEvent } from "../src/services/product-events.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

async function seedRatedDrive() {
  const student = await createJourneyForStudent("Ella");
  const invitation = await createInvitation(student.journey.id, student.userId);
  const supervisor = await acceptInvitation(invitation.token, "Pappa", null);

  await getPool().query(
    `INSERT INTO auth_identities (user_id, provider, provider_subject)
     VALUES ($1, 'email_magic_link', 'pappa@example.com')`,
    [supervisor.userId],
  );

  const skill = await getPool().query(
    `SELECT id FROM skills ORDER BY skill_key LIMIT 1`,
  );
  const skillId = skill.rows[0].id as string;

  const drive = await getPool().query(
    `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id, ended_at)
     VALUES ($1, $2, $3, now())
     RETURNING id`,
    [student.journey.id, student.userId, supervisor.userId],
  );
  const driveId = drive.rows[0].id as string;

  const observation = await getPool().query(
    `INSERT INTO drive_observations (
       journey_id, drive_id, skill_id, observer_user_id, source_type, assessment
     )
     VALUES ($1, $2, $3, $4, 'supervisor', 'with_support')
     RETURNING id`,
    [student.journey.id, driveId, skillId, supervisor.userId],
  );

  return {
    journeyId: student.journey.id,
    studentId: student.userId,
    supervisorId: supervisor.userId,
    driveId,
    observationId: observation.rows[0].id as string,
  };
}

describe("account lifecycle / tombstoning invariants", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("blocks hard DELETE of a student who owns a journey", async () => {
    const { userId } = await createJourneyForStudent("Ella");
    await assert.rejects(
      () => getPool().query(`DELETE FROM users WHERE id = $1`, [userId]),
      (error: Error) => /violates foreign key constraint/i.test(error.message),
    );
  });

  it("blocks hard DELETE of a supervisor with historical drives and observations", async () => {
    const seeded = await seedRatedDrive();
    await assert.rejects(
      () => getPool().query(`DELETE FROM users WHERE id = $1`, [seeded.supervisorId]),
      (error: Error) => /violates foreign key constraint/i.test(error.message),
    );

    const observations = await getPool().query(
      `SELECT count(*)::int AS count FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observations.rows[0].count, 1);
  });

  it("rejects a new supervisor or student observation without an actor id", async () => {
    const seeded = await seedRatedDrive();
    const skill = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 1`,
    );
    const skillId = skill.rows[0].id as string;

    await assert.rejects(
      () =>
        getPool().query(
          `INSERT INTO drive_observations (
             journey_id, drive_id, skill_id, source_type, assessment
           )
           VALUES ($1, $2, $3, 'supervisor', 'with_support')`,
          [seeded.journeyId, seeded.driveId, skillId],
        ),
      (error: Error) => /check constraint/i.test(error.message),
    );
    await assert.rejects(
      () =>
        getPool().query(
          `INSERT INTO drive_observations (
             journey_id, drive_id, skill_id, observer_user_id, source_type, assessment
           )
           VALUES ($1, $2, $3, NULL, 'student', 'with_support')`,
          [seeded.journeyId, seeded.driveId, skillId],
        ),
      (error: Error) => /check constraint/i.test(error.message),
    );
    await assert.rejects(
      () =>
        getPool().query(
          `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id)
           VALUES ($1, $2, NULL)`,
          [seeded.journeyId, seeded.studentId],
        ),
      (error: Error) => /check constraint|not-null/i.test(error.message),
    );
  });

  it("rejects nulling a living observer without the deleted marker", async () => {
    const seeded = await seedRatedDrive();
    await assert.rejects(
      () =>
        getPool().query(
          `UPDATE drive_observations SET observer_user_id = NULL WHERE id = $1`,
          [seeded.observationId],
        ),
      (error: Error) => /check constraint/i.test(error.message),
    );
    const observation = await getPool().query(
      `SELECT observer_user_id, observer_deleted, assessment
       FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observation.rows[0].observer_user_id, seeded.supervisorId);
    assert.equal(observation.rows[0].observer_deleted, false);
    assert.equal(observation.rows[0].assessment, "with_support");
  });

  it("allows unlinking historical attribution only with the deleted marker", async () => {
    const seeded = await seedRatedDrive();
    await getPool().query(
      `UPDATE drive_observations
       SET observer_user_id = NULL, observer_deleted = true
       WHERE id = $1`,
      [seeded.observationId],
    );
    const observation = await getPool().query(
      `SELECT observer_user_id, observer_deleted, assessment
       FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observation.rows[0].observer_user_id, null);
    assert.equal(observation.rows[0].observer_deleted, true);
    assert.equal(observation.rows[0].assessment, "with_support");
  });

  it("tombstones a supervisor without deleting the student journey or ledger", async () => {
    const seeded = await seedRatedDrive();

    await getPool().query(
      `DELETE FROM auth_identities WHERE user_id = $1`,
      [seeded.supervisorId],
    );
    await getPool().query(
      `UPDATE journey_collaborators
       SET status = 'removed', updated_at = now()
       WHERE user_id = $1 AND status = 'active'`,
      [seeded.supervisorId],
    );
    await getPool().query(
      `UPDATE users
       SET account_state = 'deleted',
           display_name = NULL,
           updated_at = now()
       WHERE id = $1`,
      [seeded.supervisorId],
    );

    const user = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(user.rows[0].account_state, "deleted");
    assert.equal(user.rows[0].display_name, null);

    const identities = await getPool().query(
      `SELECT count(*)::int AS count FROM auth_identities WHERE user_id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(identities.rows[0].count, 0);

    const journey = await getPool().query(
      `SELECT student_user_id, status FROM driving_journeys WHERE id = $1`,
      [seeded.journeyId],
    );
    assert.equal(journey.rows[0].student_user_id, seeded.studentId);
    assert.equal(journey.rows[0].status, "active");

    const observation = await getPool().query(
      `SELECT observer_user_id, source_type, assessment
       FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observation.rows[0].observer_user_id, seeded.supervisorId);
    assert.equal(observation.rows[0].source_type, "supervisor");
    assert.equal(observation.rows[0].assessment, "with_support");

    const drive = await getPool().query(
      `SELECT supervisor_user_id FROM drives WHERE id = $1`,
      [seeded.driveId],
    );
    assert.equal(drive.rows[0].supervisor_user_id, seeded.supervisorId);

    assert.equal((await listAccessibleActiveJourneys(seeded.supervisorId)).length, 0);
    assert.equal((await listActiveSupervisors(seeded.journeyId)).length, 0);
    assert.equal(await getJourneyAccess(seeded.journeyId, seeded.supervisorId), null);
    assert.ok(await getJourneyAccess(seeded.journeyId, seeded.studentId));
  });

  it("treats account_state=deleted supervisor as inactive even if collab row remains active", async () => {
    const seeded = await seedRatedDrive();
    await getPool().query(
      `UPDATE users SET account_state = 'deleted', display_name = NULL WHERE id = $1`,
      [seeded.supervisorId],
    );

    assert.equal((await listAccessibleActiveJourneys(seeded.supervisorId)).length, 0);
    assert.equal((await listActiveSupervisors(seeded.journeyId)).length, 0);
    assert.equal(await getJourneyAccess(seeded.journeyId, seeded.supervisorId), null);

    const observation = await getPool().query(
      `SELECT observer_user_id FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observation.rows[0].observer_user_id, seeded.supervisorId);
  });

  it("POST /start with a leftover deleted-user cookie does not resurrect the actor", async () => {
    const seeded = await seedRatedDrive();
    await getPool().query(
      `UPDATE journey_collaborators
       SET status = 'removed', updated_at = now()
       WHERE user_id = $1 AND status = 'active'`,
      [seeded.supervisorId],
    );
    await getPool().query(
      `UPDATE users
       SET account_state = 'deleted', display_name = NULL, updated_at = now()
       WHERE id = $1`,
      [seeded.supervisorId],
    );

    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(seeded.supervisorId) },
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ny elev" }),
      },
    );

    assert.equal(response.statusCode, 302);
    const location = response.headers.location;
    assert.equal(typeof location, "string");
    const journeyId = (location as string).match(/^\/journey\/([^/]+)$/)?.[1];
    assert.ok(journeyId);

    const tombstoned = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(tombstoned.rows[0].account_state, "deleted");
    assert.equal(tombstoned.rows[0].display_name, null);

    const newJourney = await getPool().query(
      `SELECT student_user_id FROM driving_journeys WHERE id = $1`,
      [journeyId],
    );
    assert.notEqual(newJourney.rows[0].student_user_id, seeded.supervisorId);

    const newStudent = await getPool().query(
      `SELECT display_name, account_state FROM users WHERE id = $1`,
      [newJourney.rows[0].student_user_id],
    );
    assert.equal(newStudent.rows[0].display_name, "Ny elev");
    assert.equal(newStudent.rows[0].account_state, "guest");

    const originalJourney = await getPool().query(
      `SELECT student_user_id, status FROM driving_journeys WHERE id = $1`,
      [seeded.journeyId],
    );
    assert.equal(originalJourney.rows[0].student_user_id, seeded.studentId);
    assert.equal(originalJourney.rows[0].status, "active");

    await app.close();
  });

  it("acceptInvitation with a leftover deleted-user cookie creates a new guest", async () => {
    const seeded = await seedRatedDrive();
    await getPool().query(
      `UPDATE users SET account_state = 'deleted', display_name = NULL WHERE id = $1`,
      [seeded.supervisorId],
    );

    const other = await createJourneyForStudent("Clara");
    const invitation = await createInvitation(other.journey.id, other.userId);
    const accepted = await acceptInvitation(
      invitation.token,
      "Ny handledare",
      seeded.supervisorId,
    );

    assert.notEqual(accepted.userId, seeded.supervisorId);

    const tombstoned = await getPool().query(
      `SELECT account_state, display_name FROM users WHERE id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(tombstoned.rows[0].account_state, "deleted");
    assert.equal(tombstoned.rows[0].display_name, null);

    const newUser = await getPool().query(
      `SELECT display_name, account_state FROM users WHERE id = $1`,
      [accepted.userId],
    );
    assert.equal(newUser.rows[0].display_name, "Ny handledare");
    assert.equal(newUser.rows[0].account_state, "guest");
  });

  it("deleteProductAccount unlinks a supervisor without dropping the student ledger", async () => {
    const seeded = await seedRatedDrive();
    await recordProductEvent({
      name: "drive_completed",
      journeyId: seeded.journeyId,
      userId: seeded.supervisorId,
      actorRole: "supervisor",
    });

    const summary = await deleteProductAccount(seeded.supervisorId);
    assert.equal(summary.deleted.authIdentities, 1);
    assert.equal(summary.deleted.studentJourneys, 0);
    assert.equal(summary.tombstoned.userRow, true);
    assert.ok(summary.unlinked.historicalObservationAttributions >= 1);
    assert.equal(summary.retained.studentHistoryPreserved, true);
    assert.ok(summary.unlinked.productEvents >= 1);

    const user = await getPool().query(
      `SELECT account_state, display_name, contact_email FROM users WHERE id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(user.rows[0].account_state, "deleted");
    assert.equal(user.rows[0].display_name, null);
    assert.equal(user.rows[0].contact_email, null);
    assert.equal((await listAccessibleActiveJourneys(seeded.supervisorId)).length, 0);
    assert.ok(await getJourneyAccess(seeded.journeyId, seeded.studentId));

    const observation = await getPool().query(
      `SELECT observer_user_id, observer_deleted, assessment
       FROM drive_observations WHERE id = $1`,
      [seeded.observationId],
    );
    assert.equal(observation.rows[0].observer_user_id, null);
    assert.equal(observation.rows[0].observer_deleted, true);
    assert.equal(observation.rows[0].assessment, "with_support");

    const drive = await getPool().query(
      `SELECT supervisor_user_id, supervisor_deleted,
              started_by_user_id, started_by_deleted
       FROM drives WHERE id = $1`,
      [seeded.driveId],
    );
    assert.equal(drive.rows[0].supervisor_user_id, null);
    assert.equal(drive.rows[0].supervisor_deleted, true);
    assert.equal(drive.rows[0].started_by_user_id, seeded.studentId);
    assert.equal(drive.rows[0].started_by_deleted, false);

    const collab = await getPool().query(
      `SELECT count(*)::int AS n FROM journey_collaborators WHERE user_id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(collab.rows[0].n, 0);

    const events = await getPool().query(
      `SELECT count(*)::int AS n FROM product_events WHERE user_id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(events.rows[0].n, 0);

    const identities = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1`,
      [seeded.supervisorId],
    );
    assert.equal(identities.rows[0].n, 0);

    const latest = await getLatestEndedDrive(seeded.journeyId);
    assert.ok(latest);
    assert.equal(latest.id, seeded.driveId);
    assert.equal(latest.supervisorUserId, null);
    assert.equal(latest.supervisorLabel, "Tidigare handledare");
    assert.equal(latest.rated, true);
  });

  it("deleteProductAccount deletes the student-owned journey but never hard-deletes the user row", async () => {
    const seeded = await seedRatedDrive();
    await recordProductEvent({
      name: "journey_created",
      journeyId: seeded.journeyId,
      userId: seeded.studentId,
      actorRole: "student",
    });
    const summary = await deleteProductAccount(seeded.studentId);
    assert.equal(summary.deleted.studentJourneys, 1);
    assert.ok(summary.deleted.studentDrives >= 1);

    const user = await getPool().query(
      `SELECT id, account_state FROM users WHERE id = $1`,
      [seeded.studentId],
    );
    assert.equal(user.rowCount, 1);
    assert.equal(user.rows[0].account_state, "deleted");

    const journey = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys WHERE id = $1`,
      [seeded.journeyId],
    );
    assert.equal(journey.rows[0].n, 0);

    const events = await getPool().query(
      `SELECT count(*)::int AS n FROM product_events WHERE user_id = $1`,
      [seeded.studentId],
    );
    assert.equal(events.rows[0].n, 0);
    assert.ok(summary.unlinked.productEvents >= 1);
  });
});
