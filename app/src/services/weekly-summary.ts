import { coachingStepCatalog } from "../domain/coaching-steps.js";
import { getPool } from "../db/pool.js";
import { readinessPercent } from "./progression.js";
import {
  APPLICABLE_SKILL_SQL,
  ASSESSMENT_SCORE_SQL,
  CANONICAL_OBSERVATION_SQL,
  latestSkillBeforeSql,
} from "./usage-stats-sql.js";

/**
 * Calendar week for the Sunday summary.
 *
 * There is no timezone column on users or households. The week is always
 * Europe/Stockholm, the same clock admin stats already use.
 *
 * Bounds are Monday 00:00 inclusive through the next Monday 00:00 exclusive.
 * PostgreSQL `date_trunc('week', …)` is Monday-based and follows Stockholm
 * DST, so a spring week is 167 hours and a normal week is 168. Subtracting
 * 7×24 hours is not used.
 *
 * A drive counts in the week of `drives.ended_at`. Training and checkoffs
 * count in the week of the canonical observation's `observed_at`, and only
 * when that observation sits on a completed drive. The same timestamp can
 * belong to only one half-open interval.
 */
export const WEEKLY_SUMMARY_TIME_ZONE = "Europe/Stockholm";

/** Local hour on Sunday when the send window opens. It stays open until Monday 00:00. */
export const WEEKLY_SUMMARY_SEND_HOUR = 18;

export interface StockholmWeek {
  timeZone: typeof WEEKLY_SUMMARY_TIME_ZONE;
  weekKey: string;
  start: Date;
  end: Date;
  /** PostgreSQL DOW in Stockholm: 0 = Sunday. */
  dow: number;
  hour: number;
}

export interface WeeklySkillCount {
  skillKey: string;
  title: string;
  trainings: number;
}

export interface JourneyWeeklySummary {
  journeyId: string;
  timeZone: typeof WEEKLY_SUMMARY_TIME_ZONE;
  weekKey: string;
  start: string;
  end: string;
  completedDrives: number;
  totalDriveSeconds: number;
  /** Rounded minutes, same rounding as the admin activity series. */
  totalDriveMinutes: number;
  /** Canonical training observations on completed drives in the week. */
  trainedSkills: number;
  uniqueTrainedSkills: number;
  /** Skills with no canonical training on a completed drive before the week. */
  newlyTrainedSkills: number;
  /** Checked coaching steps on those observations. */
  checkoffSteps: number;
  /** Skills whose full checklist was observed in the week. */
  completedSkills: number;
  /** Full checklists that were not already complete before the week. */
  newlyCompletedSkills: number;
  progressionStart: number;
  progressionEnd: number;
  supervisorsUsed: number;
  /** Sum of recorded distance. Null when no drive in the week stored a distance. */
  distanceMeters: number | null;
  topSkills: WeeklySkillCount[];
  firstDriveThisWeek: boolean;
}

export function isWeeklySummarySendWindow(dow: number, hour: number): boolean {
  return dow === 0 && hour >= WEEKLY_SUMMARY_SEND_HOUR;
}

export function weekHasRelevantActivity(summary: JourneyWeeklySummary): boolean {
  return (
    summary.completedDrives > 0 ||
    summary.trainedSkills > 0 ||
    summary.checkoffSteps > 0 ||
    summary.newlyCompletedSkills > 0
  );
}

export async function stockholmCivil(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Promise<Date> {
  const result = await getPool().query<{ at: Date }>(
    `SELECT make_timestamptz($1, $2, $3, $4, $5, 0, 'Europe/Stockholm') AS at`,
    [year, month, day, hour, minute],
  );
  return new Date(result.rows[0].at);
}

export async function stockholmWeekContaining(instant: Date): Promise<StockholmWeek> {
  const result = await getPool().query<{
    week_start: Date;
    week_end: Date;
    week_key: string;
    dow: number;
    hour: number;
  }>(
    `SELECT
       (date_trunc('week', $1::timestamptz AT TIME ZONE 'Europe/Stockholm'))
         AT TIME ZONE 'Europe/Stockholm' AS week_start,
       (date_trunc('week', $1::timestamptz AT TIME ZONE 'Europe/Stockholm') + interval '7 days')
         AT TIME ZONE 'Europe/Stockholm' AS week_end,
       to_char(
         date_trunc('week', $1::timestamptz AT TIME ZONE 'Europe/Stockholm'),
         'IYYY-"W"IW'
       ) AS week_key,
       EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE 'Europe/Stockholm'))::int AS dow,
       EXTRACT(HOUR FROM ($1::timestamptz AT TIME ZONE 'Europe/Stockholm'))::int AS hour`,
    [instant],
  );
  const row = result.rows[0];
  return {
    timeZone: WEEKLY_SUMMARY_TIME_ZONE,
    weekKey: String(row.week_key),
    start: new Date(row.week_start),
    end: new Date(row.week_end),
    dow: Number(row.dow),
    hour: Number(row.hour),
  };
}

/** The Stockholm week before `week`. Uses an instant inside that week, not a 168-hour shift. */
export async function previousStockholmWeek(week: StockholmWeek): Promise<StockholmWeek> {
  return stockholmWeekContaining(new Date(week.start.getTime() - 60 * 60 * 1000));
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface TopSkillRow {
  skillKey?: string;
  title?: string;
  trainings?: number;
}

function topSkills(value: unknown): WeeklySkillCount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as TopSkillRow;
    if (typeof row.skillKey !== "string" || typeof row.title !== "string") return [];
    return [{ skillKey: row.skillKey, title: row.title, trainings: num(row.trainings) }];
  });
}

/**
 * Week summary for one journey. `week.start` is inclusive and `week.end` is
 * exclusive. Returns null when the journey does not exist.
 */
export async function getJourneyWeeklySummary(
  journeyId: string,
  week: Pick<StockholmWeek, "weekKey" | "start" | "end">,
): Promise<JourneyWeeklySummary | null> {
  const exists = await getPool().query(`SELECT 1 FROM driving_journeys WHERE id = $1`, [journeyId]);
  if (exists.rowCount === 0) return null;

  const catalog = coachingStepCatalog();
  const scoreStart = ASSESSMENT_SCORE_SQL.replaceAll("assessment", "ls.assessment");
  const scoreEnd = ASSESSMENT_SCORE_SQL.replaceAll("assessment", "le.assessment");
  const result = await getPool().query(
    `WITH bounds AS (
       SELECT $2::timestamptz AS start_at, $3::timestamptz AS end_at
     ),
     canonical AS (${CANONICAL_OBSERVATION_SQL}),
     expected AS (
       SELECT * FROM unnest($4::text[], $5::int[]) AS e(skill_key, step_count)
     ),
     drives_in_week AS (
       SELECT d.id, d.ended_at, d.started_at, d.distance_meters, d.supervisor_user_id
       FROM drives d, bounds
       WHERE d.journey_id = $1
         AND d.ended_at IS NOT NULL
         AND d.ended_at >= bounds.start_at
         AND d.ended_at < bounds.end_at
     ),
     training AS (
       SELECT
         c.skill_id,
         c.completed_step_keys,
         s.skill_key,
         sd.title,
         sd.sort_order
       FROM canonical c
       JOIN drives d
         ON d.id = c.drive_id AND d.journey_id = c.journey_id AND d.ended_at IS NOT NULL
       JOIN skills s ON s.id = c.skill_id
       JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
       CROSS JOIN bounds
       WHERE c.journey_id = $1
         AND c.observed_at >= bounds.start_at
         AND c.observed_at < bounds.end_at
     ),
     training_before AS (
       SELECT DISTINCT c.skill_id
       FROM canonical c
       JOIN drives d
         ON d.id = c.drive_id AND d.journey_id = c.journey_id AND d.ended_at IS NOT NULL
       CROSS JOIN bounds
       WHERE c.journey_id = $1
         AND c.observed_at < bounds.start_at
     ),
     full_in_week AS (
       SELECT t.skill_id
       FROM training t
       JOIN expected e ON e.skill_key = t.skill_key
       WHERE e.step_count > 0
         AND (
           SELECT count(DISTINCT key)::int
           FROM unnest(t.completed_step_keys) AS key
         ) >= e.step_count
     ),
     full_before AS (
       SELECT DISTINCT c.skill_id
       FROM canonical c
       JOIN drives d
         ON d.id = c.drive_id AND d.journey_id = c.journey_id AND d.ended_at IS NOT NULL
       JOIN skills s ON s.id = c.skill_id
       JOIN expected e ON e.skill_key = s.skill_key
       CROSS JOIN bounds
       WHERE c.journey_id = $1
         AND c.observed_at < bounds.start_at
         AND e.step_count > 0
         AND (
           SELECT count(DISTINCT key)::int
           FROM unnest(c.completed_step_keys) AS key
         ) >= e.step_count
     ),
     latest_start AS (${latestSkillBeforeSql("$2::timestamptz")}),
     latest_end AS (${latestSkillBeforeSql("$3::timestamptz")}),
     applicable AS (${APPLICABLE_SKILL_SQL}),
     progress AS (
       SELECT
         count(*)::int AS skill_count,
         COALESCE(sum(${scoreStart}), 0)::int AS points_start,
         COALESCE(sum(${scoreEnd}), 0)::int AS points_end
       FROM applicable a
       LEFT JOIN latest_start ls
         ON ls.journey_id = a.journey_id AND ls.skill_id = a.skill_id
       LEFT JOIN latest_end le
         ON le.journey_id = a.journey_id AND le.skill_id = a.skill_id
       WHERE a.journey_id = $1
     )
     SELECT
       (SELECT count(*)::int FROM drives_in_week) AS completed_drives,
       (
         SELECT COALESCE(sum(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)::float
         FROM drives_in_week
       ) AS duration_seconds,
       (SELECT count(*)::int FROM training) AS trained,
       (SELECT count(DISTINCT skill_id)::int FROM training) AS unique_trained,
       (
         SELECT count(DISTINCT t.skill_id)::int
         FROM training t
         WHERE NOT EXISTS (
           SELECT 1 FROM training_before b WHERE b.skill_id = t.skill_id
         )
       ) AS newly_trained,
       (
         SELECT COALESCE(sum(cardinality(completed_step_keys)), 0)::int FROM training
       ) AS checkoffs,
       (SELECT count(DISTINCT skill_id)::int FROM full_in_week) AS completed_skills,
       (
         SELECT count(DISTINCT f.skill_id)::int
         FROM full_in_week f
         WHERE NOT EXISTS (SELECT 1 FROM full_before b WHERE b.skill_id = f.skill_id)
       ) AS newly_completed,
       (SELECT skill_count FROM progress) AS skill_count,
       (SELECT points_start FROM progress) AS points_start,
       (SELECT points_end FROM progress) AS points_end,
       (
         SELECT count(DISTINCT d.supervisor_user_id)::int
         FROM drives_in_week d
         JOIN driving_journeys j ON j.id = $1
         WHERE d.supervisor_user_id IS NOT NULL
           AND d.supervisor_user_id <> j.student_user_id
       ) AS supervisors,
       (
         SELECT CASE
           WHEN count(distance_meters) = 0 THEN NULL
           ELSE COALESCE(sum(distance_meters), 0)::float
         END
         FROM drives_in_week
       ) AS distance_meters,
       (
         SELECT count(*)::int
         FROM drives d, bounds
         WHERE d.journey_id = $1
           AND d.ended_at IS NOT NULL
           AND d.ended_at < bounds.start_at
       ) AS drives_before,
       (
         SELECT COALESCE(
           json_agg(
             json_build_object(
               'skillKey', skill_key,
               'title', title,
               'trainings', trainings
             )
             ORDER BY trainings DESC, sort_order, title
           ),
           '[]'::json
         )
         FROM (
           SELECT skill_key, title, sort_order, count(*)::int AS trainings
           FROM training
           GROUP BY skill_key, title, sort_order
           ORDER BY count(*) DESC, sort_order, title
           LIMIT 3
         ) ranked
       ) AS top_skills`,
    [
      journeyId,
      week.start,
      week.end,
      catalog.map((row) => row.skillKey),
      catalog.map((row) => row.stepCount),
    ],
  );

  const row = result.rows[0] ?? {};
  const skillCount = num(row.skill_count);
  const seconds = num(row.duration_seconds);
  const completedDrives = num(row.completed_drives);
  return {
    journeyId,
    timeZone: WEEKLY_SUMMARY_TIME_ZONE,
    weekKey: week.weekKey,
    start: week.start.toISOString(),
    end: week.end.toISOString(),
    completedDrives,
    totalDriveSeconds: seconds,
    totalDriveMinutes: Math.round(seconds / 60),
    trainedSkills: num(row.trained),
    uniqueTrainedSkills: num(row.unique_trained),
    newlyTrainedSkills: num(row.newly_trained),
    checkoffSteps: num(row.checkoffs),
    completedSkills: num(row.completed_skills),
    newlyCompletedSkills: num(row.newly_completed),
    progressionStart: readinessPercent(num(row.points_start), skillCount * 3),
    progressionEnd: readinessPercent(num(row.points_end), skillCount * 3),
    supervisorsUsed: num(row.supervisors),
    distanceMeters: numOrNull(row.distance_meters),
    topSkills: topSkills(row.top_skills),
    firstDriveThisWeek: completedDrives > 0 && num(row.drives_before) === 0,
  };
}
