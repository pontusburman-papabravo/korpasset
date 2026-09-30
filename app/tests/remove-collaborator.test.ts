import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { createDriveWithFocus } from "../src/services/drives.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import {
  createJourneyForStudent,
  listAccessibleActiveJourneys,
  listActiveSupervisors,
  removeJourneySupervisor,
} from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

async function supervisorStatus(
  journeyId: string,
  userId: string,
): Promise<string | null> {
  const result = await getPool().query(
    `SELECT status FROM journey_collaborators
     WHERE journey_id = $1 AND user_id = $2 AND role = 'supervisor'`,
    [journeyId, userId],
  );
  return result.rows[0]?.status ?? null;
}

describe("remove supervisor and leave journey", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("lets the student remove a supervisor and invite them back", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    assert.equal((await listActiveSupervisors(journey.id)).length, 1);

    const app = await createTestApp();
    const removed = await injectWithSession(app, session(studentId), {
      method: "POST",
      url: `/journey/${journey.id}/supervisors/${supervisor.userId}/remove`,
    });
    assert.equal(removed.statusCode, 302);
    assert.equal(removed.headers.location, `/journey/${journey.id}`);
    assert.equal(await supervisorStatus(journey.id, supervisor.userId), "removed");
    assert.equal((await listActiveSupervisors(journey.id)).length, 0);

    const blocked = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(blocked.statusCode, 403);

    const again = await createInvitation(journey.id, studentId);
    const reconnected = await acceptInvitation(again.token, "Pappa", supervisor.userId);
    assert.equal(reconnected.userId, supervisor.userId);
    assert.equal(await supervisorStatus(journey.id, supervisor.userId), "active");
    assert.equal((await listActiveSupervisors(journey.id)).length, 1);
    await app.close();
  });

  it("lets a supervisor leave so the student disappears from their list", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);

    const app = await createTestApp();
    const mer = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: "/mer",
    });
    assert.equal(mer.statusCode, 200);
    assert.match(mer.body, new RegExp(`action="/journey/${journey.id}/leave"`));
    assert.match(mer.body, /Lämna resan/);

    const left = await injectWithSession(app, session(supervisor.userId), {
      method: "POST",
      url: `/journey/${journey.id}/leave`,
    });
    assert.equal(left.statusCode, 302);
    assert.equal(left.headers.location, "/onboarding");
    assert.equal(await supervisorStatus(journey.id, supervisor.userId), "removed");
    assert.equal((await listAccessibleActiveJourneys(supervisor.userId)).length, 0);
    assert.equal((await listAccessibleActiveJourneys(studentId)).length, 1);

    const home = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Ingen handledare ännu/);
    await app.close();
  });

  it("does not let another supervisor remove a colleague", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const firstInvite = await createInvitation(journey.id, studentId);
    const pappa = await acceptInvitation(firstInvite.token, "Pappa", null);
    const secondInvite = await createInvitation(journey.id, studentId);
    const mamma = await acceptInvitation(secondInvite.token, "Mamma", null);

    await assert.rejects(
      () => removeJourneySupervisor(journey.id, mamma.userId, pappa.userId),
      (error: Error & { statusCode?: number }) => error.statusCode === 403,
    );
    assert.equal(await supervisorStatus(journey.id, pappa.userId), "active");

    const app = await createTestApp();
    const denied = await injectWithSession(app, session(mamma.userId), {
      method: "POST",
      url: `/journey/${journey.id}/supervisors/${pappa.userId}/remove`,
    });
    assert.equal(denied.statusCode, 403);
    await app.close();
  });

  it("does not let the student leave their own journey", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const leave = await injectWithSession(app, session(studentId), {
      method: "POST",
      url: `/journey/${journey.id}/leave`,
    });
    assert.equal(leave.statusCode, 403);
    await app.close();
  });

  it("blocks removal while that supervisor has an open drive", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const skills = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 2`,
    );
    await createDriveWithFocus(
      journey.id,
      studentId,
      skills.rows.map((row) => row.id as string),
    );

    await assert.rejects(
      () =>
        removeJourneySupervisor(journey.id, studentId, supervisor.userId),
      (error: Error & { statusCode?: number; code?: string }) =>
        error.statusCode === 409 && error.code === "active_drive",
    );
    assert.equal(await supervisorStatus(journey.id, supervisor.userId), "active");
  });
});
