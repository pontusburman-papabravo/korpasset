import type pg from "pg";
import { getPool } from "../db/pool.js";
import type { PracticeStage } from "./journeys.js";

export interface RecommendedSkill {
  skillId: string;
  skillKey: string;
  title: string;
  reason: "training_focus" | "needs_help" | "with_support" | "core_unobserved";
  message: string;
}

const REASON_MESSAGES: Record<RecommendedSkill["reason"], string> = {
  training_focus: "Valt fokus",
  needs_help: "Behöver mer träning",
  with_support: "Träna vidare",
  core_unobserved: "Värt att ta nästa gång",
};

const EMPTY_FOCUS_COPY: Record<PracticeStage, string> = {
  unknown:
    "Välj 2–3 moment som känns osäkra — även om ni redan kört länge. Efter första bedömningen blir tipsen mer träffsäkra.",
  just_started:
    "Börja med det som känns osäkert i lugn trafik. Efter första bedömningen blir tipsen mer träffsäkra.",
  building:
    "Ni har redan kört ett tag. Välj det som fortfarande är osäkert — inte första lektionen.",
  near_test:
    "Inför uppkörningen: välj moment som fortfarande kräver påminnelse. Körpasset bedömer inte om ni är redo.",
};

/** Later-stage families should not get beginner car-control first. */
const CORE_AREA_PREFERENCE: Record<PracticeStage, string[] | null> = {
  unknown: null,
  just_started: null,
  building: [
    "intersections_roundabouts",
    "urban_traffic",
    "rural_roads",
    "highway",
    "independent_safe_driving",
  ],
  near_test: [
    "independent_safe_driving",
    "highway",
    "maneuvering",
    "rural_roads",
    "intersections_roundabouts",
  ],
};

export function emptyFocusCopy(stage: string): string {
  if (stage === "just_started") return EMPTY_FOCUS_COPY.just_started;
  if (stage === "building") return EMPTY_FOCUS_COPY.building;
  if (stage === "near_test") return EMPTY_FOCUS_COPY.near_test;
  return EMPTY_FOCUS_COPY.unknown;
}

export async function recommendNextFocus(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<RecommendedSkill[]> {
  const db = client ?? getPool();

  const journeyResult = await db.query(
    `SELECT transmission_scope, practice_stage FROM driving_journeys WHERE id = $1`,
    [journeyId],
  );
  if (journeyResult.rowCount === 0) return [];
  const transmissionScope = journeyResult.rows[0].transmission_scope;
  const practiceStage = String(journeyResult.rows[0].practice_stage) as PracticeStage;

  const excludeGearShifting = transmissionScope === "automatic_only";

  const recommendations: RecommendedSkill[] = [];
  const usedSkillIds = new Set<string>();

  const addRecommendation = (
    row: {
      skill_id: string;
      skill_key: string;
      title: string;
      reason: RecommendedSkill["reason"];
    },
  ) => {
    if (usedSkillIds.has(row.skill_id)) return;
    if (excludeGearShifting && row.skill_key === "car_control_gear_shifting") {
      return;
    }
    if (recommendations.length >= 3) return;
    usedSkillIds.add(row.skill_id);
    recommendations.push({
      skillId: row.skill_id,
      skillKey: row.skill_key,
      title: row.title,
      reason: row.reason,
      message: REASON_MESSAGES[row.reason],
    });
  };

  const trainingFocus = await db.query(
    `SELECT s.id AS skill_id, s.skill_key, sd.title
     FROM training_focus_items tfi
     JOIN skills s ON s.id = tfi.skill_id
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     WHERE tfi.journey_id = $1
       AND tfi.status = 'active'
     ORDER BY tfi.created_at DESC`,
    [journeyId],
  );
  for (const row of trainingFocus.rows) {
    addRecommendation({ ...row, reason: "training_focus" });
  }

  const latestObservations = await db.query(
    `SELECT DISTINCT ON (o.skill_id)
            o.skill_id, s.skill_key, sd.title, o.assessment, o.observed_at
     FROM drive_observations o
     JOIN skills s ON s.id = o.skill_id
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     WHERE o.journey_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM drive_observations newer
         WHERE newer.supersedes_observation_id = o.id
           AND newer.journey_id = o.journey_id
       )
     ORDER BY o.skill_id, o.observed_at DESC`,
    [journeyId],
  );

  const needsHelp = latestObservations.rows
    .filter((row) => row.assessment === "needs_help")
    .sort(
      (a, b) =>
        new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
    );
  for (const row of needsHelp) {
    addRecommendation({ ...row, reason: "needs_help" });
  }

  const withSupport = latestObservations.rows
    .filter((row) => row.assessment === "with_support")
    .sort(
      (a, b) =>
        new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
    );
  for (const row of withSupport) {
    addRecommendation({ ...row, reason: "with_support" });
  }

  const preferredAreas = CORE_AREA_PREFERENCE[practiceStage] ?? null;
  const coreUnobserved = await db.query(
    `SELECT s.id AS skill_id, s.skill_key, sd.title
     FROM skills s
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     WHERE sd.mvp_priority = 'core'
       AND NOT EXISTS (
         SELECT 1 FROM drive_observations o
         WHERE o.journey_id = $1
           AND o.skill_id = s.id
           AND NOT EXISTS (
             SELECT 1 FROM drive_observations newer
             WHERE newer.supersedes_observation_id = o.id
               AND newer.journey_id = o.journey_id
           )
       )
     ORDER BY
       CASE
         WHEN $2::text[] IS NULL THEN 0
         ELSE COALESCE(array_position($2::text[], sd.area_key), 100)
       END,
       sd.sort_order`,
    [journeyId, preferredAreas],
  );
  for (const row of coreUnobserved.rows) {
    addRecommendation({ ...row, reason: "core_unobserved" });
  }

  return recommendations;
}
