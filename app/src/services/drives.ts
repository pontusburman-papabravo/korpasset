import type pg from "pg";
import { AppError, ForbiddenError, NotFoundError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import {
  getJourneyAccess,
  requireJourneyAccess,
} from "./authorization.js";
import { listActiveSupervisors } from "./journeys.js";
import type { SkillWithDefinition } from "./skills.js";
import { getSkillsByIds } from "./skills.js";
import { actorDisplayName } from "./actor-display.js";

export interface Drive {
  id: string;
  journeyId: string;
  startedByUserId: string;
  supervisorUserId: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface EndedDriveSummary {
  id: string;
  endedAt: Date;
  supervisorUserId: string;
  supervisorLabel: string;
  rated: boolean;
}

export async function getLatestEndedDrive(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<EndedDriveSummary | null> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT d.id, d.ended_at, d.supervisor_user_id,
            u.display_name, u.account_state,
            EXISTS (
              SELECT 1 FROM drive_observations o
              WHERE o.journey_id = d.journey_id
                AND o.drive_id = d.id
                AND o.source_type = 'supervisor'
            ) AS rated
     FROM drives d
     JOIN users u ON u.id = d.supervisor_user_id
     WHERE d.journey_id = $1 AND d.ended_at IS NOT NULL
     ORDER BY d.ended_at DESC
     LIMIT 1`,
    [journeyId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: String(row.id),
    endedAt: new Date(row.ended_at),
    supervisorUserId: String(row.supervisor_user_id),
    supervisorLabel: actorDisplayName(row.display_name, row.account_state, "supervisor"),
    rated: Boolean(row.rated),
  };
}

export async function getActiveDrive(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<Drive | null> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT id, journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at
     FROM drives
     WHERE journey_id = $1 AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [journeyId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    journeyId: row.journey_id,
    startedByUserId: row.started_by_user_id,
    supervisorUserId: row.supervisor_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export async function driveHasSupervisorRating(
  journeyId: string,
  driveId: string,
  client?: pg.PoolClient,
): Promise<boolean> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT 1 FROM drive_observations
     WHERE journey_id = $1
       AND drive_id = $2
       AND source_type = 'supervisor'
     LIMIT 1`,
    [journeyId, driveId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function resolveSupervisorUserId(
  journeyId: string,
  userId: string,
  requestedSupervisorUserId: string | null | undefined,
  client: pg.PoolClient,
): Promise<string> {
  const access = await getJourneyAccess(journeyId, userId, client);
  if (!access) {
    throw new ForbiddenError("No access to this journey");
  }

  const supervisors = await listActiveSupervisors(journeyId, client);
  if (supervisors.length === 0) {
    throw new AppError("An active supervisor is required before starting a drive");
  }

  if (access.role === "supervisor") {
    return userId;
  }

  if (supervisors.length === 1) {
    return supervisors[0].userId;
  }

  if (!requestedSupervisorUserId) {
    throw new AppError("Supervisor selection is required", 400, "supervisor_required");
  }

  const isValid = supervisors.some((s) => s.userId === requestedSupervisorUserId);
  if (!isValid) {
    throw new ForbiddenError("Selected supervisor is not active on this journey");
  }

  return requestedSupervisorUserId;
}

export async function createDriveWithFocus(
  journeyId: string,
  userId: string,
  skillIds: string[],
  requestedSupervisorUserId?: string | null,
): Promise<{ drive: Drive; focusSkills: SkillWithDefinition[] }> {
  if (skillIds.length < 2 || skillIds.length > 3) {
    throw new AppError("Select 2–3 skills for drive focus");
  }

  const uniqueSkillIds = [...new Set(skillIds)];
  if (uniqueSkillIds.length !== skillIds.length) {
    throw new AppError("Duplicate skills are not allowed");
  }

  const skills = await getSkillsByIds(uniqueSkillIds, journeyId);
  if (skills.length !== uniqueSkillIds.length) {
    throw new AppError("One or more skills are invalid");
  }

  return withTransaction(async (client) => {
    await client.query(
      `SELECT id FROM driving_journeys WHERE id = $1 FOR UPDATE`,
      [journeyId],
    );

    const activeDrive = await getActiveDrive(journeyId, client);
    if (activeDrive) {
      throw new AppError("An active drive already exists for this journey", 409, "active_drive_exists");
    }

    const supervisorUserId = await resolveSupervisorUserId(
      journeyId,
      userId,
      requestedSupervisorUserId,
      client,
    );

    const driveResult = await client.query(
      `INSERT INTO drives (
         journey_id, started_by_user_id, supervisor_user_id,
         environment, light_condition, weather_condition, traffic_level
       )
       VALUES ($1, $2, $3, '{}', NULL, NULL, NULL)
       RETURNING id, journey_id, started_by_user_id, supervisor_user_id,
                 started_at, ended_at`,
      [journeyId, userId, supervisorUserId],
    );
    const driveRow = driveResult.rows[0];
    const driveId = driveRow.id;

    for (const skill of skills) {
      await client.query(
        `INSERT INTO drive_focus_skills (
           drive_id, journey_id, skill_id, training_focus_item_id
         )
         VALUES ($1, $2, $3, NULL)`,
        [driveId, journeyId, skill.skillId],
      );
    }

    return {
      drive: {
        id: driveRow.id,
        journeyId: driveRow.journey_id,
        startedByUserId: driveRow.started_by_user_id,
        supervisorUserId: driveRow.supervisor_user_id,
        startedAt: driveRow.started_at,
        endedAt: driveRow.ended_at,
      },
      focusSkills: skills,
    };
  });
}

export async function getDrive(
  journeyId: string,
  driveId: string,
  userId: string,
  client?: pg.PoolClient,
): Promise<Drive | null> {
  await requireJourneyAccess(journeyId, userId, client);
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT id, journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at
     FROM drives
     WHERE id = $1 AND journey_id = $2`,
    [driveId, journeyId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    journeyId: row.journey_id,
    startedByUserId: row.started_by_user_id,
    supervisorUserId: row.supervisor_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export async function getDriveFocusSkills(
  journeyId: string,
  driveId: string,
  userId: string,
): Promise<SkillWithDefinition[]> {
  await requireJourneyAccess(journeyId, userId);
  const result = await getPool().query(
    `SELECT s.id AS skill_id
     FROM drive_focus_skills dfs
     JOIN skills s ON s.id = dfs.skill_id
     WHERE dfs.drive_id = $1 AND dfs.journey_id = $2
     ORDER BY dfs.created_at`,
    [driveId, journeyId],
  );
  const skillIds = result.rows.map((row) => row.skill_id);
  return getSkillsByIds(skillIds, journeyId);
}

function canEndDrive(
  access: Awaited<ReturnType<typeof requireJourneyAccess>>,
  userId: string,
  supervisorUserId: string,
): boolean {
  return access.role === "student" || userId === supervisorUserId;
}

export async function endDrive(
  journeyId: string,
  driveId: string,
  userId: string,
): Promise<Drive> {
  const access = await requireJourneyAccess(journeyId, userId);

  const existingResult = await getPool().query(
    `SELECT id, journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at
     FROM drives
     WHERE id = $1 AND journey_id = $2`,
    [driveId, journeyId],
  );
  if (existingResult.rowCount === 0) {
    throw new NotFoundError("Drive not found");
  }

  const existing = existingResult.rows[0];
  if (!canEndDrive(access, userId, existing.supervisor_user_id)) {
    throw new ForbiddenError(
      "Only the student or assigned supervisor can end this drive",
    );
  }

  if (existing.ended_at) {
    return {
      id: existing.id,
      journeyId: existing.journey_id,
      startedByUserId: existing.started_by_user_id,
      supervisorUserId: existing.supervisor_user_id,
      startedAt: existing.started_at,
      endedAt: existing.ended_at,
    };
  }

  const result = await getPool().query(
    `UPDATE drives
     SET ended_at = now()
     WHERE id = $1 AND journey_id = $2 AND ended_at IS NULL
     RETURNING id, journey_id, started_by_user_id, supervisor_user_id,
               started_at, ended_at`,
    [driveId, journeyId],
  );
  if (result.rowCount === 0) {
    throw new AppError("Drive could not be ended");
  }
  const row = result.rows[0];
  return {
    id: row.id,
    journeyId: row.journey_id,
    startedByUserId: row.started_by_user_id,
    supervisorUserId: row.supervisor_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export async function assertDriveSupervisorForObservation(
  journeyId: string,
  driveId: string,
  observerUserId: string,
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? getPool();

  const collabResult = await db.query(
    `SELECT 1 FROM journey_collaborators
     WHERE journey_id = $1
       AND user_id = $2
       AND role = 'supervisor'
       AND status = 'active'`,
    [journeyId, observerUserId],
  );
  if (collabResult.rowCount === 0) {
    throw new ForbiddenError("Active supervisor required");
  }

  const driveResult = await db.query(
    `SELECT supervisor_user_id FROM drives WHERE id = $1 AND journey_id = $2`,
    [driveId, journeyId],
  );
  if (driveResult.rowCount === 0) {
    throw new NotFoundError("Drive not found");
  }
  if (driveResult.rows[0].supervisor_user_id !== observerUserId) {
    throw new ForbiddenError("Wrong supervisor for this drive");
  }
}
