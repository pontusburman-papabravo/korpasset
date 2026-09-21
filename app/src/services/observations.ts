import type pg from "pg";
import { AppError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import { normalizeCompletedStepKeys } from "../domain/coaching-steps.js";
import { assertDriveSupervisorForObservation } from "./drives.js";
import { listActiveSupervisors } from "./journeys.js";
import {
  countCompletedRatedDrives,
  recordProductEventSafe,
} from "./product-events.js";

export type AssessmentLevel = "needs_help" | "with_support" | "independent";

const VALID_ASSESSMENTS = new Set<AssessmentLevel>([
  "needs_help",
  "with_support",
  "independent",
]);

export const LIVE_NOTE_MAX_LENGTH = 280;

export const ASSESSMENT_DISPLAY: Record<
  AssessmentLevel,
  { label: string; microcopy: string; signal: string }
> = {
  independent: {
    label: "Utan hjälp",
    microcopy: "Eleven klarar momentet utan instruktion eller ingripande",
    signal: "🟢",
  },
  with_support: {
    label: "Med påminnelse",
    microcopy: "Behöver ibland en fråga eller kort instruktion",
    signal: "🟡",
  },
  needs_help: {
    label: "Behöver hjälp",
    microcopy: "Behöver tydlig eller återkommande vägledning",
    signal: "🔴",
  },
};

const NON_SUPERSEDED_CLAUSE = `
  AND NOT EXISTS (
    SELECT 1 FROM drive_observations newer
    WHERE newer.supersedes_observation_id = o.id
      AND newer.journey_id = o.journey_id
  )
`;

export interface DriveObservationRecap {
  skillId: string;
  skillKey: string;
  title: string;
  assessment: AssessmentLevel;
  note: string | null;
  completedStepKeys: string[];
}

export interface LatestDriveObservation {
  skillId: string;
  skillKey: string;
  title: string;
  assessment: AssessmentLevel;
  note: string | null;
  completedStepKeys: string[];
}

export interface ObservationInput {
  skillId: string;
  assessment: AssessmentLevel;
  note?: string | null;
  completedStepKeys?: string[];
}

type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient;

function normalizeNote(raw: string | null | undefined): string | null {
  const note = raw?.trim() ?? "";
  if (!note) return null;
  if (note.length > LIVE_NOTE_MAX_LENGTH) {
    throw new AppError("Anteckningen är för lång", 400, "invalid_note");
  }
  return note;
}

async function getDriveFocusSkillIds(
  client: Queryable,
  journeyId: string,
  driveId: string,
): Promise<string[]> {
  const focusResult = await client.query(
    `SELECT skill_id FROM drive_focus_skills
     WHERE drive_id = $1 AND journey_id = $2
     ORDER BY created_at`,
    [driveId, journeyId],
  );
  return focusResult.rows.map((row) => row.skill_id as string);
}

async function getObservedFocusSkillIds(
  client: Queryable,
  journeyId: string,
  driveId: string,
): Promise<Set<string>> {
  const result = await client.query(
    `SELECT DISTINCT o.skill_id
     FROM drive_observations o
     JOIN drive_focus_skills dfs
       ON dfs.skill_id = o.skill_id
      AND dfs.drive_id = $2
      AND dfs.journey_id = $1
     WHERE o.journey_id = $1
       AND o.drive_id = $2
       AND o.source_type = 'supervisor'
       ${NON_SUPERSEDED_CLAUSE}`,
    [journeyId, driveId],
  );
  return new Set(result.rows.map((row) => row.skill_id as string));
}

function validateObservationPayload(
  observations: ObservationInput[],
  allowedSkillIds: Set<string>,
): void {
  const seenSkillIds = new Set<string>();
  for (const obs of observations) {
    if (!VALID_ASSESSMENTS.has(obs.assessment)) {
      throw new AppError("Invalid assessment level");
    }
    normalizeNote(obs.note);
    if (seenSkillIds.has(obs.skillId)) {
      throw new AppError("Duplicate skill in rating payload");
    }
    seenSkillIds.add(obs.skillId);
    if (!allowedSkillIds.has(obs.skillId)) {
      throw new AppError("Observation skill must be part of drive focus");
    }
  }
}

async function skillKeyById(
  client: Queryable,
  skillId: string,
): Promise<string> {
  const result = await client.query(`SELECT skill_key FROM skills WHERE id = $1`, [
    skillId,
  ]);
  if (result.rowCount === 0) {
    throw new AppError("Unknown skill", 400);
  }
  return String(result.rows[0].skill_key);
}

async function insertSupervisorObservations(
  client: pg.PoolClient,
  journeyId: string,
  driveId: string,
  observerUserId: string,
  observations: ObservationInput[],
): Promise<void> {
  for (const obs of observations) {
    const skillKey = await skillKeyById(client, obs.skillId);
    const completedStepKeys = normalizeCompletedStepKeys(
      skillKey,
      obs.completedStepKeys,
    );
    await client.query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id,
         source_type, assessment, note, completed_step_keys
       )
       VALUES ($1, $2, $3, $4, 'supervisor', $5, $6, $7)`,
      [
        journeyId,
        driveId,
        obs.skillId,
        observerUserId,
        obs.assessment,
        normalizeNote(obs.note),
        completedStepKeys,
      ],
    );
  }
}

async function recordRatingEvents(
  client: pg.PoolClient,
  journeyId: string,
  observerUserId: string,
  focusSkillCount: number,
): Promise<void> {
  const supervisors = await listActiveSupervisors(journeyId, client);
  const ratedCount = await countCompletedRatedDrives(journeyId, client);
  await recordProductEventSafe(
    {
      name: "rating_completed",
      journeyId,
      userId: observerUserId,
      actorRole: "supervisor",
      supervisorCount: supervisors.length,
      focusSkillCount,
    },
    undefined,
    client,
  );
  if (ratedCount >= 2) {
    await recordProductEventSafe(
      {
        name: "second_drive_completed",
        journeyId,
        userId: observerUserId,
        actorRole: "supervisor",
        supervisorCount: supervisors.length,
        focusSkillCount,
      },
      undefined,
      client,
    );
  }
}

export async function getLatestDriveObservationsBySkill(
  journeyId: string,
  driveId: string,
  client?: pg.PoolClient,
): Promise<LatestDriveObservation[]> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT DISTINCT ON (o.skill_id)
            o.skill_id, s.skill_key, o.assessment, o.note, o.completed_step_keys,
            sd.title, sd.sort_order
     FROM drive_observations o
     JOIN skills s ON s.id = o.skill_id
     JOIN skill_definitions sd ON sd.skill_id = o.skill_id AND sd.taxonomy_version = 1
     WHERE o.journey_id = $1
       AND o.drive_id = $2
       AND o.source_type = 'supervisor'
       ${NON_SUPERSEDED_CLAUSE}
     ORDER BY o.skill_id, o.observed_at DESC, o.id DESC`,
    [journeyId, driveId],
  );

  return result.rows
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((row) => ({
      skillId: String(row.skill_id),
      skillKey: String(row.skill_key),
      title: String(row.title),
      assessment: row.assessment as AssessmentLevel,
      note: row.note == null ? null : String(row.note),
      completedStepKeys: Array.isArray(row.completed_step_keys)
        ? row.completed_step_keys.map((key: string) => String(key))
        : [],
    }));
}

export async function getDriveObservationRecap(
  journeyId: string,
  driveId: string,
  client?: pg.PoolClient,
): Promise<DriveObservationRecap[]> {
  return getLatestDriveObservationsBySkill(journeyId, driveId, client);
}

export async function getMissingDriveFocusSkillIds(
  journeyId: string,
  driveId: string,
  client?: pg.PoolClient,
): Promise<string[]> {
  const db = client ?? getPool();
  const focusSkillIds = await getDriveFocusSkillIds(db, journeyId, driveId);
  const observedSkillIds = await getObservedFocusSkillIds(db, journeyId, driveId);
  return focusSkillIds.filter((skillId) => !observedSkillIds.has(skillId));
}

export async function addLiveObservation(
  journeyId: string,
  driveId: string,
  observerUserId: string,
  input: ObservationInput,
): Promise<void> {
  if (!VALID_ASSESSMENTS.has(input.assessment)) {
    throw new AppError("Invalid assessment level");
  }
  const note = normalizeNote(input.note);

  return withTransaction(async (client) => {
    const driveResult = await client.query(
      `SELECT id, ended_at
       FROM drives
       WHERE id = $1 AND journey_id = $2
       FOR UPDATE`,
      [driveId, journeyId],
    );

    if (driveResult.rowCount === 0) {
      throw new AppError("Drive not found", 404);
    }

    if (driveResult.rows[0].ended_at) {
      throw new AppError("Cannot add observation to ended drive");
    }

    await assertDriveSupervisorForObservation(
      journeyId,
      driveId,
      observerUserId,
      client,
    );

    const focusCheck = await client.query(
      `SELECT 1 FROM drive_focus_skills
       WHERE drive_id = $1 AND journey_id = $2 AND skill_id = $3`,
      [driveId, journeyId, input.skillId],
    );
    if (focusCheck.rowCount === 0) {
      throw new AppError("Observation skill must be part of drive focus");
    }

    const skillKey = await skillKeyById(client, input.skillId);
    const completedStepKeys = normalizeCompletedStepKeys(
      skillKey,
      input.completedStepKeys,
    );

    await client.query(
      `INSERT INTO drive_observations (
         journey_id, drive_id, skill_id, observer_user_id,
         source_type, assessment, note, completed_step_keys
       )
       VALUES ($1, $2, $3, $4, 'supervisor', $5, $6, $7)`,
      [
        journeyId,
        driveId,
        input.skillId,
        observerUserId,
        input.assessment,
        note,
        completedStepKeys,
      ],
    );
  });
}

export async function saveDriveObservations(
  journeyId: string,
  driveId: string,
  observerUserId: string,
  observations: ObservationInput[],
): Promise<void> {
  return withTransaction(async (client) => {
    const driveResult = await client.query(
      `SELECT id, journey_id, supervisor_user_id, ended_at
       FROM drives
       WHERE id = $1 AND journey_id = $2
       FOR UPDATE`,
      [driveId, journeyId],
    );

    if (driveResult.rowCount === 0) {
      throw new AppError("Drive not found", 404);
    }

    const drive = driveResult.rows[0];
    if (!drive.ended_at) {
      throw new AppError("Drive must be ended before rating");
    }

    await assertDriveSupervisorForObservation(
      journeyId,
      driveId,
      observerUserId,
      client,
    );

    const focusSkillIds = await getDriveFocusSkillIds(client, journeyId, driveId);
    const allowedSkillIds = new Set(focusSkillIds);

    if (observations.length !== focusSkillIds.length) {
      throw new AppError("Rating must include exactly one assessment per drive focus skill");
    }

    validateObservationPayload(observations, allowedSkillIds);

    for (const skillId of focusSkillIds) {
      if (!observations.some((obs) => obs.skillId === skillId)) {
        throw new AppError("Rating must include exactly one assessment per drive focus skill");
      }
    }

    const observedSkillIds = await getObservedFocusSkillIds(client, journeyId, driveId);
    if (observedSkillIds.size > 0) {
      throw new AppError("Drive has already been rated", 409, "already_rated");
    }

    await insertSupervisorObservations(
      client,
      journeyId,
      driveId,
      observerUserId,
      observations,
    );
    await recordRatingEvents(client, journeyId, observerUserId, observations.length);
  });
}

export async function completeMissingDriveObservations(
  journeyId: string,
  driveId: string,
  observerUserId: string,
  observations: ObservationInput[],
): Promise<void> {
  return withTransaction(async (client) => {
    const driveResult = await client.query(
      `SELECT id, ended_at
       FROM drives
       WHERE id = $1 AND journey_id = $2
       FOR UPDATE`,
      [driveId, journeyId],
    );

    if (driveResult.rowCount === 0) {
      throw new AppError("Drive not found", 404);
    }

    if (!driveResult.rows[0].ended_at) {
      throw new AppError("Drive must be ended before rating");
    }

    await assertDriveSupervisorForObservation(
      journeyId,
      driveId,
      observerUserId,
      client,
    );

    const focusSkillIds = await getDriveFocusSkillIds(client, journeyId, driveId);
    const allowedSkillIds = new Set(focusSkillIds);
    const observedSkillIds = await getObservedFocusSkillIds(client, journeyId, driveId);
    const missingSkillIds = focusSkillIds.filter((skillId) => !observedSkillIds.has(skillId));

    if (missingSkillIds.length === 0) {
      throw new AppError("Drive focus is already fully observed", 409, "already_rated");
    }

    validateObservationPayload(observations, allowedSkillIds);

    const missingSet = new Set(missingSkillIds);
    for (const obs of observations) {
      if (!missingSet.has(obs.skillId)) {
        throw new AppError("Observation skill is not missing from drive focus");
      }
    }

    if (observations.length !== missingSkillIds.length) {
      throw new AppError("Rating must include exactly one assessment per missing drive focus skill");
    }

    await insertSupervisorObservations(
      client,
      journeyId,
      driveId,
      observerUserId,
      observations,
    );
    await recordRatingEvents(client, journeyId, observerUserId, focusSkillIds.length);
  });
}

export async function recordRatingEventsIfFullyObserved(
  journeyId: string,
  driveId: string,
  observerUserId: string,
): Promise<void> {
  return withTransaction(async (client) => {
    const missing = await getMissingDriveFocusSkillIds(journeyId, driveId, client);
    if (missing.length > 0) return;
    const focusSkillIds = await getDriveFocusSkillIds(client, journeyId, driveId);
    if (focusSkillIds.length === 0) return;
    await recordRatingEvents(client, journeyId, observerUserId, focusSkillIds.length);
  });
}
