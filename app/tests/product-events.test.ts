import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import {
  createDriveWithFocus,
  endDrive,
} from "../src/services/drives.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { saveDriveObservations } from "../src/services/observations.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

async function eventNames(journeyId: string): Promise<string[]> {
  const result = await getPool().query(
    `SELECT event_name FROM product_events
     WHERE journey_id = $1
     ORDER BY created_at, event_name`,
    [journeyId],
  );
  return result.rows.map((row) => String(row.event_name));
}

describe("beta product events", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("records the canonical funnel without storing display names", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const skills = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 2`,
    );
    const skillIds = skills.rows.map((row) => row.id as string);
    const first = await createDriveWithFocus(journey.id, studentId, skillIds);
    await endDrive(journey.id, first.drive.id, studentId);
    await saveDriveObservations(journey.id, first.drive.id, supervisor.userId, [
      { skillId: skillIds[0], assessment: "needs_help" },
      { skillId: skillIds[1], assessment: "with_support" },
    ]);

    const second = await createDriveWithFocus(journey.id, studentId, skillIds);
    await endDrive(journey.id, second.drive.id, studentId);
    await saveDriveObservations(journey.id, second.drive.id, supervisor.userId, [
      { skillId: skillIds[0], assessment: "with_support" },
      { skillId: skillIds[1], assessment: "independent" },
    ]);

    const app = await createTestApp();
    const recap = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(studentId) },
      { method: "GET", url: `/journey/${journey.id}/drive/${second.drive.id}/done` },
    );
    assert.equal(recap.statusCode, 200);
    await app.close();

    const names = await eventNames(journey.id);
    for (const required of [
      "journey_created",
      "supervisor_connected",
      "drive_focus_saved",
      "drive_started",
      "drive_completed",
      "rating_completed",
      "recap_viewed",
      "second_drive_completed",
    ]) {
      assert.ok(names.includes(required), `missing ${required}: ${names.join(",")}`);
    }

    const payloads = await getPool().query(
      `SELECT event_name, user_id, actor_role, supervisor_count, focus_skill_count
       FROM product_events WHERE journey_id = $1`,
      [journey.id],
    );
    assert.ok(payloads.rows.every((row) => row.user_id));
    assert.ok(
      payloads.rows.every((row) => !JSON.stringify(row).includes("Ella")),
    );
    assert.ok(
      payloads.rows.every((row) => !JSON.stringify(row).includes("Pappa")),
    );
  });
});
