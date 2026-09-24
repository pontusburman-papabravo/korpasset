import type pg from "pg";
import { getPool } from "../db/pool.js";

export const PRODUCT_EVENTS = [
  "journey_created",
  "supervisor_connected",
  "drive_focus_saved",
  "drive_started",
  "drive_completed",
  "rating_completed",
  "recap_viewed",
  "second_drive_completed",
  "onboarding_role_selected",
  "student_handoff_started",
  "stale_drive_nudge_shown",
  "journey_switched",
  "next_drive_plan_created",
  "next_drive_plan_updated",
  "training_guidance_opened",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export const JOURNEY_CREATED_SOURCES = ["direct", "parent_handoff"] as const;
export type JourneyCreatedSource = (typeof JOURNEY_CREATED_SOURCES)[number];

export const EVENT_PRACTICE_STAGES = [
  "unknown",
  "just_started",
  "building",
  "near_test",
] as const;
export type EventPracticeStage = (typeof EVENT_PRACTICE_STAGES)[number];

export const DAYS_SINCE_DRIVE_BUCKETS = ["5-7", "8-14", "15-30", "31+"] as const;
export type DaysSinceDriveBucket = (typeof DAYS_SINCE_DRIVE_BUCKETS)[number];

export interface ProductEventInput {
  name: ProductEventName;
  journeyId?: string | null;
  userId?: string | null;
  actorRole?: "student" | "supervisor" | null;
  supervisorCount?: number | null;
  focusSkillCount?: number | null;
  eventSource?: JourneyCreatedSource | null;
  practiceStage?: EventPracticeStage | null;
  daysSinceDriveBucket?: DaysSinceDriveBucket | null;
}

export function daysSinceDriveBucket(days: number): DaysSinceDriveBucket {
  if (days <= 7) return "5-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "31+";
}

export async function recordProductEvent(
  input: ProductEventInput,
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? getPool();
  await db.query(
    `INSERT INTO product_events (
       event_name, journey_id, user_id, actor_role, supervisor_count, focus_skill_count,
       event_source, practice_stage, days_since_drive_bucket
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.name,
      input.journeyId ?? null,
      input.userId ?? null,
      input.actorRole ?? null,
      input.supervisorCount ?? null,
      input.focusSkillCount ?? null,
      input.eventSource ?? null,
      input.practiceStage ?? null,
      input.daysSinceDriveBucket ?? null,
    ],
  );
}

export async function recordProductEventSafe(
  input: ProductEventInput,
  log?: { error: (obj: unknown, msg: string) => void },
  client?: pg.PoolClient,
): Promise<void> {
  try {
    await recordProductEvent(input, client);
  } catch (error) {
    log?.error({ err: error, event: input.name }, "product event failed");
  }
}

export async function countCompletedRatedDrives(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<number> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT count(*)::int AS count
     FROM drives d
     WHERE d.journey_id = $1
       AND d.ended_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM drive_focus_skills dfs
         WHERE dfs.drive_id = d.id
           AND dfs.journey_id = d.journey_id
           AND NOT EXISTS (
             SELECT 1 FROM drive_observations o
             WHERE o.journey_id = d.journey_id
               AND o.drive_id = d.id
               AND o.skill_id = dfs.skill_id
               AND o.source_type = 'supervisor'
               AND NOT EXISTS (
                 SELECT 1 FROM drive_observations newer
                 WHERE newer.supersedes_observation_id = o.id
                   AND newer.journey_id = o.journey_id
               )
           )
       )`,
    [journeyId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
