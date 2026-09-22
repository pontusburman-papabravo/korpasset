import type pg from "pg";
import { ConflictError, ForbiddenError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import { createGuestUser, getReusableSessionUserId } from "./users.js";
import { recordProductEventSafe } from "./product-events.js";

export interface DrivingJourney {
  id: string;
  studentUserId: string;
  studentName: string | null;
  licenceType: string;
  transmissionScope: string;
  status: string;
}

const ACTIVE_STUDENT_JOURNEY_UNIQUE = "driving_journeys_one_active_student_b";

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505" &&
    (error as { constraint?: string }).constraint === constraint
  );
}

export function activeStudentJourneyExistsError(): ConflictError {
  return new ConflictError(
    "Du har redan en aktiv körkortsresa.",
    "active_student_journey_exists",
  );
}

export async function createJourneyForStudent(
  displayName: string,
  existingUserId?: string | null,
): Promise<{ journey: DrivingJourney; userId: string }> {
  try {
    return await createJourneyForStudentInTransaction(displayName, existingUserId);
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_STUDENT_JOURNEY_UNIQUE)) {
      throw activeStudentJourneyExistsError();
    }
    throw error;
  }
}

async function createJourneyForStudentInTransaction(
  displayName: string,
  existingUserId?: string | null,
): Promise<{ journey: DrivingJourney; userId: string }> {
  return withTransaction(async (client) => {
    const reusableUserId = await getReusableSessionUserId(existingUserId, client);
    const userId =
      reusableUserId ?? (await createGuestUser(displayName, client)).id;

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [`student-journey:${userId}`, "B"],
    );

    const existing = await client.query(
      `SELECT id FROM driving_journeys
       WHERE student_user_id = $1 AND status = 'active' AND licence_type = 'B'
       FOR UPDATE`,
      [userId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw activeStudentJourneyExistsError();
    }

    if (reusableUserId) {
      await client.query(
        `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
        [reusableUserId, displayName.trim()],
      );
    }

    const journeyResult = await client.query(
      `INSERT INTO driving_journeys (student_user_id, licence_type, transmission_scope)
       VALUES ($1, 'B', 'unknown')
       RETURNING id, student_user_id, licence_type, transmission_scope, status`,
      [userId],
    );
    const row = journeyResult.rows[0];

    const userResult = await client.query(
      `SELECT display_name FROM users WHERE id = $1`,
      [userId],
    );

    const created = {
      userId,
      journey: {
        id: row.id,
        studentUserId: row.student_user_id,
        studentName: userResult.rows[0].display_name,
        licenceType: row.licence_type,
        transmissionScope: row.transmission_scope,
        status: row.status,
      },
    };
    await recordProductEventSafe(
      {
        name: "journey_created",
        journeyId: created.journey.id,
        userId,
        actorRole: "student",
        supervisorCount: 0,
      },
      undefined,
      client,
    );
    return created;
  });
}

export async function getJourneyById(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<DrivingJourney | null> {
  const db = client ?? (await import("../db/pool.js")).getPool();
  const result = await db.query(
    `SELECT j.id, j.student_user_id, j.licence_type, j.transmission_scope, j.status,
            u.display_name AS student_name
     FROM driving_journeys j
     JOIN users u ON u.id = j.student_user_id
     WHERE j.id = $1`,
    [journeyId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    studentName: row.student_name,
    licenceType: row.licence_type,
    transmissionScope: row.transmission_scope,
    status: row.status,
  };
}

export interface AccessibleJourney {
  id: string;
  studentName: string;
  lastDriveAt: Date | null;
}

export function formatAccessibleJourneyLabel(journey: AccessibleJourney): string {
  const name = journey.studentName.trim() || "Eleven";
  if (!journey.lastDriveAt) return name;
  const formatted = journey.lastDriveAt
    .toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
    .replaceAll(".", "");
  return `${name} — senast körd ${formatted}`;
}

export async function listAccessibleActiveJourneys(
  userId: string,
  client?: pg.PoolClient,
): Promise<AccessibleJourney[]> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT j.id,
            COALESCE(u.display_name, 'Eleven') AS student_name,
            (
              SELECT MAX(COALESCE(d.ended_at, d.started_at))
              FROM drives d
              WHERE d.journey_id = j.id
            ) AS last_drive_at
     FROM driving_journeys j
     JOIN users u ON u.id = j.student_user_id
     WHERE j.status = 'active'
       AND (
         j.student_user_id = $1
         OR EXISTS (
           SELECT 1
           FROM journey_collaborators jc
           JOIN users cu ON cu.id = jc.user_id
           WHERE jc.journey_id = j.id
             AND jc.user_id = $1
             AND jc.role = 'supervisor'
             AND jc.status = 'active'
             AND cu.account_state IN ('guest', 'active')
         )
       )
     ORDER BY last_drive_at DESC NULLS LAST, j.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    studentName: row.student_name as string,
    lastDriveAt: row.last_drive_at ? new Date(row.last_drive_at) : null,
  }));
}

export async function resolveHomeJourneyId(
  userId: string,
  client?: pg.PoolClient,
): Promise<string | null> {
  const journeys = await listAccessibleActiveJourneys(userId, client);
  if (journeys.length === 1) return journeys[0].id;
  return null;
}

export async function listActiveSupervisors(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<{ userId: string; displayName: string | null }[]> {
  const db = client ?? (await import("../db/pool.js")).getPool();
  const result = await db.query(
    `SELECT jc.user_id, u.display_name
     FROM journey_collaborators jc
     JOIN users u ON u.id = jc.user_id
     WHERE jc.journey_id = $1
       AND jc.role = 'supervisor'
       AND jc.status = 'active'
       AND u.account_state IN ('guest', 'active')
     ORDER BY jc.created_at`,
    [journeyId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
  }));
}

export async function updateTransmissionScope(
  journeyId: string,
  studentUserId: string,
  transmissionScope: "unknown" | "manual" | "automatic_only",
): Promise<void> {
  const result = await getPool().query(
    `UPDATE driving_journeys
     SET transmission_scope = $3, updated_at = now()
     WHERE id = $1 AND student_user_id = $2
     RETURNING id`,
    [journeyId, studentUserId, transmissionScope],
  );
  if (result.rowCount === 0) {
    throw new ForbiddenError("Bara eleven kan ändra växellåda");
  }
}

export function transmissionLabel(scope: string): string {
  if (scope === "manual") return "Manuell";
  if (scope === "automatic_only") return "Automat";
  return "Inte angivet";
}
