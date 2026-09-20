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
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export interface ProductEventInput {
  name: ProductEventName;
  journeyId?: string | null;
  userId?: string | null;
  actorRole?: "student" | "supervisor" | null;
  supervisorCount?: number | null;
  focusSkillCount?: number | null;
}

export async function recordProductEvent(
  input: ProductEventInput,
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? getPool();
  await db.query(
    `INSERT INTO product_events (
       event_name, journey_id, user_id, actor_role, supervisor_count, focus_skill_count
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.name,
      input.journeyId ?? null,
      input.userId ?? null,
      input.actorRole ?? null,
      input.supervisorCount ?? null,
      input.focusSkillCount ?? null,
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
       AND EXISTS (
         SELECT 1 FROM drive_observations o
         WHERE o.journey_id = d.journey_id
           AND o.drive_id = d.id
           AND o.source_type = 'supervisor'
       )`,
    [journeyId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
