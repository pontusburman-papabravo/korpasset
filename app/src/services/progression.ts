import type pg from "pg";
import { getPool } from "../db/pool.js";
import { getJourneyById } from "./journeys.js";
import { listSkillsForTaxonomy } from "./skills.js";
import type { AssessmentLevel } from "./observations.js";
import { ASSESSMENT_DISPLAY } from "./observations.js";

export interface AreaProgress {
  areaKey: string;
  areaTitle: string;
  skillCount: number;
  trainedCount: number;
  independentCount: number;
  driveCount: number;
  lastTrainedAt: Date | null;
}

export interface SkillProgress {
  skillId: string;
  skillKey: string;
  title: string;
  areaKey: string;
  areaTitle: string;
  assessment: AssessmentLevel | null;
  notApplicable: boolean;
}

export function isSkillNotApplicable(
  skillKey: string,
  transmissionScope: string | undefined,
): boolean {
  return (
    transmissionScope === "automatic_only" &&
    skillKey === "car_control_gear_shifting"
  );
}

export async function listAreaProgress(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<AreaProgress[]> {
  const db = client ?? getPool();
  const journey = await getJourneyById(journeyId, client);
  const skills = await listSkillsForTaxonomy(1, client);

  const latest = await db.query(
    `SELECT DISTINCT ON (o.skill_id)
            o.skill_id, o.assessment, o.observed_at
     FROM drive_observations o
     WHERE o.journey_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM drive_observations newer
         WHERE newer.supersedes_observation_id = o.id
           AND newer.journey_id = o.journey_id
       )
     ORDER BY o.skill_id, o.observed_at DESC`,
    [journeyId],
  );
  const latestBySkill = new Map(
    latest.rows.map((row) => [
      String(row.skill_id),
      {
        assessment: row.assessment as AssessmentLevel,
        observedAt: new Date(row.observed_at),
      },
    ]),
  );

  const driveCounts = await db.query(
    `SELECT sd.area_key, count(DISTINCT o.drive_id)::int AS drive_count
     FROM drive_observations o
     JOIN skills s ON s.id = o.skill_id
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     WHERE o.journey_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM drive_observations newer
         WHERE newer.supersedes_observation_id = o.id
           AND newer.journey_id = o.journey_id
       )
     GROUP BY sd.area_key`,
    [journeyId],
  );
  const drivesByArea = new Map(
    driveCounts.rows.map((row) => [String(row.area_key), Number(row.drive_count)]),
  );

  const areas = new Map<string, AreaProgress>();
  for (const skill of skills) {
    if (isSkillNotApplicable(skill.skillKey, journey?.transmissionScope)) continue;
    const existing = areas.get(skill.areaKey);
    const area =
      existing ??
      {
        areaKey: skill.areaKey,
        areaTitle: skill.areaTitle,
        skillCount: 0,
        trainedCount: 0,
        independentCount: 0,
        driveCount: drivesByArea.get(skill.areaKey) ?? 0,
        lastTrainedAt: null,
      };
    area.skillCount += 1;
    const observation = latestBySkill.get(skill.skillId);
    if (observation) {
      area.trainedCount += 1;
      if (observation.assessment === "independent") area.independentCount += 1;
      if (!area.lastTrainedAt || observation.observedAt > area.lastTrainedAt) {
        area.lastTrainedAt = observation.observedAt;
      }
    }
    areas.set(skill.areaKey, area);
  }

  return [...areas.values()];
}

export async function listSkillProgress(
  journeyId: string,
  client?: pg.PoolClient,
): Promise<SkillProgress[]> {
  const db = client ?? getPool();
  const journey = await getJourneyById(journeyId, client);
  const skills = await listSkillsForTaxonomy(1, client);
  const latest = await db.query(
    `SELECT DISTINCT ON (o.skill_id)
            o.skill_id, o.assessment
     FROM drive_observations o
     WHERE o.journey_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM drive_observations newer
         WHERE newer.supersedes_observation_id = o.id
           AND newer.journey_id = o.journey_id
       )
     ORDER BY o.skill_id, o.observed_at DESC`,
    [journeyId],
  );
  const latestBySkill = new Map(
    latest.rows.map((row) => [String(row.skill_id), row.assessment as AssessmentLevel]),
  );

  return skills.map((skill) => {
    const notApplicable = isSkillNotApplicable(
      skill.skillKey,
      journey?.transmissionScope,
    );
    return {
      skillId: skill.skillId,
      skillKey: skill.skillKey,
      title: skill.title,
      areaKey: skill.areaKey,
      areaTitle: skill.areaTitle,
      assessment: notApplicable ? null : (latestBySkill.get(skill.skillId) ?? null),
      notApplicable,
    };
  });
}

export function skillProgressLabel(skill: SkillProgress): string {
  if (skill.notApplicable) return "Gäller inte automat";
  if (!skill.assessment) return "Inte tränat ännu";
  return ASSESSMENT_DISPLAY[skill.assessment].label;
}

export function formatDay(date: Date | null): string | null {
  if (!date) return null;
  return date
    .toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
    .replaceAll(".", "");
}
