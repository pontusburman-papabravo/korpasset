import type pg from "pg";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { getPool } from "../db/pool.js";
import { getUserById, isProductActorUsable } from "./users.js";

export type JourneyRole = "student" | "supervisor";

export interface JourneyAccess {
  journeyId: string;
  studentUserId: string;
  role: JourneyRole;
  transmissionScope: string;
}

export async function getJourneyAccess(
  journeyId: string,
  userId: string,
  client?: pg.PoolClient,
): Promise<JourneyAccess | null> {
  const db = client ?? getPool();
  const actor = await getUserById(userId, client);
  if (!actor || !isProductActorUsable(actor.accountState)) return null;

  const journeyResult = await db.query(
    `SELECT id, student_user_id, transmission_scope
     FROM driving_journeys
     WHERE id = $1`,
    [journeyId],
  );
  if (journeyResult.rowCount === 0) return null;

  const journey = journeyResult.rows[0];
  if (journey.student_user_id === userId) {
    return {
      journeyId: journey.id,
      studentUserId: journey.student_user_id,
      role: "student",
      transmissionScope: journey.transmission_scope,
    };
  }

  const collabResult = await db.query(
    `SELECT 1 FROM journey_collaborators jc
     JOIN users u ON u.id = jc.user_id
     WHERE jc.journey_id = $1
       AND jc.user_id = $2
       AND jc.role = 'supervisor'
       AND jc.status = 'active'
       AND u.account_state IN ('guest', 'active')`,
    [journeyId, userId],
  );
  if (collabResult.rowCount === 0) return null;

  return {
    journeyId: journey.id,
    studentUserId: journey.student_user_id,
    role: "supervisor",
    transmissionScope: journey.transmission_scope,
  };
}

export async function requireJourneyAccess(
  journeyId: string,
  userId: string,
  client?: pg.PoolClient,
): Promise<JourneyAccess> {
  const access = await getJourneyAccess(journeyId, userId, client);
  if (!access) {
    throw new ForbiddenError("No access to this journey");
  }
  return access;
}

export async function requireActiveSupervisor(
  journeyId: string,
  userId: string,
  client?: pg.PoolClient,
): Promise<JourneyAccess> {
  const access = await requireJourneyAccess(journeyId, userId, client);
  if (access.role !== "supervisor") {
    throw new ForbiddenError("Active supervisor required");
  }
  return access;
}

export async function getStudentName(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<string> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT u.display_name
     FROM driving_journeys j
     JOIN users u ON u.id = j.student_user_id
     WHERE j.id = $1`,
    [journeyId],
  );
  if (result.rowCount === 0) {
    throw new NotFoundError("Journey not found");
  }
  return result.rows[0].display_name ?? "Eleven";
}
