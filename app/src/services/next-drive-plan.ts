import type pg from "pg";
import { AppError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import { requireJourneyAccess } from "./authorization.js";
import { getSkillsByIds } from "./skills.js";
import { recordProductEventSafe } from "./product-events.js";

export interface NextDrivePlanSkill {
  skillId: string;
  skillKey: string;
  title: string;
}

export interface NextDrivePlan {
  skills: NextDrivePlanSkill[];
  plannedByUserId: string | null;
  plannedByName: string | null;
  updatedAt: Date;
}

function mapPlan(rows: Array<Record<string, unknown>>): NextDrivePlan | null {
  if (rows.length === 0) return null;
  return {
    skills: rows.map((row) => ({
      skillId: String(row.skill_id),
      skillKey: String(row.skill_key),
      title: String(row.title),
    })),
    plannedByUserId: rows[0].created_by_user_id
      ? String(rows[0].created_by_user_id)
      : null,
    plannedByName: rows[0].planner_name ? String(rows[0].planner_name) : null,
    updatedAt: new Date(String(rows[0].updated_at ?? rows[0].created_at)),
  };
}

export async function getActiveNextDrivePlan(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<NextDrivePlan | null> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT tfi.skill_id, tfi.created_by_user_id, tfi.created_at, tfi.updated_at,
            s.skill_key, sd.title, u.display_name AS planner_name
     FROM training_focus_items tfi
     JOIN skills s ON s.id = tfi.skill_id
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     LEFT JOIN users u ON u.id = tfi.created_by_user_id
     WHERE tfi.journey_id = $1
       AND tfi.status = 'active'
     ORDER BY tfi.created_at ASC`,
    [journeyId],
  );
  return mapPlan(result.rows);
}

export async function saveNextDrivePlan(
  journeyId: string,
  userId: string,
  skillIds: string[],
): Promise<{ plan: NextDrivePlan; created: boolean }> {
  if (skillIds.length < 2 || skillIds.length > 3) {
    throw new AppError("Välj 2–3 moment", 400, "plan_skill_count");
  }
  const uniqueSkillIds = [...new Set(skillIds)];
  if (uniqueSkillIds.length !== skillIds.length) {
    throw new AppError("Samma moment kan inte väljas två gånger", 400);
  }

  const access = await requireJourneyAccess(journeyId, userId);
  const skills = await getSkillsByIds(uniqueSkillIds, journeyId);
  if (skills.length !== uniqueSkillIds.length) {
    throw new AppError("Ett eller flera moment är ogiltiga", 400);
  }

  return withTransaction(async (client) => {
    await client.query(
      `SELECT id FROM driving_journeys WHERE id = $1 FOR UPDATE`,
      [journeyId],
    );
    const existing = await client.query(
      `SELECT id FROM training_focus_items
       WHERE journey_id = $1 AND status = 'active'`,
      [journeyId],
    );
    const created = (existing.rowCount ?? 0) === 0;
    await client.query(
      `UPDATE training_focus_items
       SET status = 'dismissed', updated_at = now()
       WHERE journey_id = $1 AND status = 'active'`,
      [journeyId],
    );
    const source = access.role === "student" ? "student" : "supervisor";
    for (const skill of skills) {
      await client.query(
        `INSERT INTO training_focus_items (
           journey_id, skill_id, source, status, created_by_user_id, updated_at
         ) VALUES ($1, $2, $3, 'active', $4, now())`,
        [journeyId, skill.skillId, source, userId],
      );
    }
    const plan = await getActiveNextDrivePlan(journeyId, client);
    if (!plan) {
      throw new AppError("Kunde inte spara planen", 500);
    }
    await recordProductEventSafe(
      {
        name: created ? "next_drive_plan_created" : "next_drive_plan_updated",
        journeyId,
        userId,
        actorRole: access.role,
        focusSkillCount: skills.length,
      },
      undefined,
      client,
    );
    return { plan, created };
  });
}
