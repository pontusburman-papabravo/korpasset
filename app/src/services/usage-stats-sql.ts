/**
 * Shared definitions for admin usage stats and the Sunday weekly summary.
 * A completed drive, a trained moment, a checked step and progression must
 * be counted the same way in both places.
 *
 * - Genomfört körpass: drives.ended_at IS NOT NULL.
 * - Momentträning: senaste kanoniska bedömningen per körpass och moment,
 *   bara på genomförda pass.
 * - Avbockning: ibockat körsteg (completed_step_keys) på den bedömningen.
 * - Hela checklistan: alla körsteg för momentet är ibockade.
 * - Progression: behöver hjälp 1, med påminnelse 2, utan hjälp 3.
 *   Växling räknas inte när resan är automat. Öppna pass ingår, eftersom
 *   appen visar dem.
 */

export const CANONICAL_OBSERVATION_SQL = `
  SELECT DISTINCT ON (o.journey_id, o.drive_id, o.skill_id)
         o.journey_id,
         o.drive_id,
         o.skill_id,
         o.assessment,
         o.completed_step_keys,
         o.observed_at
  FROM drive_observations o
  WHERE NOT EXISTS (
    SELECT 1
    FROM drive_observations newer
    WHERE newer.supersedes_observation_id = o.id
      AND newer.journey_id = o.journey_id
  )
  ORDER BY o.journey_id, o.drive_id, o.skill_id,
           o.observed_at DESC, o.created_at DESC, o.id DESC
`;

export const APPLICABLE_SKILL_SQL = `
  SELECT j.id AS journey_id, s.id AS skill_id
  FROM driving_journeys j
  JOIN skills s ON true
  JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
  WHERE NOT (
    j.transmission_scope = 'automatic_only'
    AND s.skill_key = 'car_control_gear_shifting'
  )
`;

export const ASSESSMENT_SCORE_SQL = `
  CASE assessment
    WHEN 'needs_help' THEN 1
    WHEN 'with_support' THEN 2
    WHEN 'independent' THEN 3
    ELSE 0
  END
`;

/**
 * Latest canonical assessment per skill among observations strictly before
 * `observedBefore`. A later row only replaces an earlier one when it is
 * also before the cutoff, matching the admin "30 dagar sedan" snapshot.
 */
export function latestSkillBeforeSql(observedBefore: string): string {
  return `
  SELECT DISTINCT ON (o.journey_id, o.skill_id)
         o.journey_id, o.skill_id, o.assessment
  FROM drive_observations o
  WHERE o.observed_at < ${observedBefore}
    AND NOT EXISTS (
      SELECT 1
      FROM drive_observations newer
      WHERE newer.supersedes_observation_id = o.id
        AND newer.journey_id = o.journey_id
        AND newer.observed_at < ${observedBefore}
    )
  ORDER BY o.journey_id, o.skill_id, o.observed_at DESC, o.created_at DESC, o.id DESC
`;
}
