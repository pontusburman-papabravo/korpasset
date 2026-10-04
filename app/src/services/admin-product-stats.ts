import { coachingStepCatalog } from "../domain/coaching-steps.js";
import { getPool } from "../db/pool.js";
import { readinessPercent } from "./progression.js";
import { listSkillsForTaxonomy } from "./skills.js";
import {
  DRIVE_COUNT_BUCKETS,
  PROGRESS_BUCKETS,
  STUCK_SIGNALS,
  driveCountBucket,
  journeyUsageStatus,
  median,
  progressBucket,
  stuckSignals,
  type DriveCountBucket,
  type ProgressBucket,
  type StuckSignal,
  type UsageSnapshot,
  type UsageWindows,
} from "./usage-metrics.js";
import {
  APPLICABLE_SKILL_SQL as APPLICABLE,
  ASSESSMENT_SCORE_SQL as SCORE,
  CANONICAL_OBSERVATION_SQL as CANONICAL,
  latestSkillBeforeSql,
} from "./usage-stats-sql.js";

/**
 * Admin product usage. Aggregated on the server from domain tables.
 *
 * No new product events and no new tables. The facts already live on
 * users, driving_journeys, journey_collaborators, journey_invitations,
 * drives, drive_observations and skill_definitions.
 *
 * Definitions:
 * - Genomfört körpass: drives.ended_at IS NOT NULL. Öppna pass räknas inte.
 * - Aktiv användare: icke-raderat konto med appöppning (last_seen_at),
 *   genomfört körpass, produkt-händelse eller bedömning i perioden.
 * - Aktiv körkortsresa: minst ett genomfört körpass i perioden.
 * - Perioder är Stockholm-dygn, inklusive idag (7 dygn = idag och 6 bakåt).
 * - Momentträning: senaste kanoniska bedömningen per körpass och moment,
 *   bara på genomförda pass. Ombedömning på samma pass räknas en gång.
 * - Avbockning: ibockat körsteg (completed_step_keys) på den bedömningen.
 * - Hela checklistan: alla körsteg för momentet är ibockade.
 * - Progression: samma modell som i appen (behöver hjälp 1, med påminnelse 2,
 *   utan hjälp 3). Växling räknas inte när resan är automat.
 *   Öppna pass ingår i progressionen, eftersom appen visar dem.
 * - Raderade konton ingår inte i konton, elever, handledare eller aktiva
 *   användare. Admin-inloggningar ligger i admin_users och räknas inte.
 * - En elev med flera handledare är en resa och en elev.
 *
 * Körpass, momentträning, avbockning och progression delas med veckomejlet
 * via usage-stats-sql.ts.
 */

/** Last N Stockholm calendar days, including today. */
function stockholmStart(daysInclusive: number): string {
  const back = daysInclusive - 1;
  return `(date_trunc('day', now() AT TIME ZONE 'Europe/Stockholm') - interval '${back} days') AT TIME ZONE 'Europe/Stockholm'`;
}

const START_7 = stockholmStart(7);
const START_14 = stockholmStart(14);
const START_30 = stockholmStart(30);
const START_90 = stockholmStart(90);
const LATEST_SKILL_BEFORE_30 = latestSkillBeforeSql(START_30);

const LATEST_SKILL = `
  SELECT DISTINCT ON (o.journey_id, o.skill_id)
         o.journey_id, o.skill_id, o.assessment
  FROM drive_observations o
  WHERE NOT EXISTS (
    SELECT 1
    FROM drive_observations newer
    WHERE newer.supersedes_observation_id = o.id
      AND newer.journey_id = o.journey_id
  )
  ORDER BY o.journey_id, o.skill_id, o.observed_at DESC, o.created_at DESC, o.id DESC
`;

export const STATS_PERIODS = ["7", "30", "90", "all"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export function statsPeriod(value: string | undefined): StatsPeriod {
  return STATS_PERIODS.includes(value as StatsPeriod) ? (value as StatsPeriod) : "30";
}

export interface JourneyFact {
  journeyId: string;
  studentUserId: string;
  createdAt: string;
  activeSupervisors: number;
  pendingInvites: number;
  completedDrives: number;
  drivesCompleted30d: number;
  lastCompletedAt: string | null;
  durationSeconds: number;
  trainedObservations: number;
  uniqueSkillsTrained: number;
  checkoffSteps: number;
  progressionPercent: number;
  progressionPoints: number;
  progressionPointsAgo30: number;
  skillCount: number;
}

export interface ActivityPoint {
  bucket: string;
  newUsers: number;
  activeUsers: number;
  activeJourneys: number;
  drives: number;
  durationMinutes: number;
  trainings: number;
  checkoffs: number;
}

export interface RetentionCell {
  rate: number | null;
  retained: number;
  size: number;
}

export interface RetentionCohort {
  week: string;
  size: number;
  drive: RetentionCell[];
  activity: RetentionCell[];
}

export interface SkillUsageRow {
  skillKey: string;
  title: string;
  areaKey: string;
  areaTitle: string;
  trainings: number;
  studentsTrained: number;
  checkoffs: number;
  studentsChecked: number;
  studentsCompleted: number;
}

export interface AreaUsageRow {
  areaKey: string;
  areaTitle: string;
  trainings: number;
  checkoffs: number;
  students: number;
  averageProgressPercent: number;
  startedJourneys: number;
  completedJourneys: number;
  journeys: number;
}

export interface CountShare {
  key: string;
  count: number;
  percent: number;
}

export interface AdminProductStats {
  windows: UsageWindows;
  accounts: number;
  students: number;
  supervisors: number;
  journeys: number;
  newAccounts7d: number;
  newAccounts30d: number;
  activeUsers7d: number;
  activeUsers30d: number;
  activeJourneys7d: number;
  activeJourneys30d: number;
  accountsWithoutJourney: number;
  drives: {
    total: number;
    last7d: number;
    last30d: number;
    students7d: number;
    students30d: number;
    perActiveStudentAvg: number | null;
    perActiveStudentMedian: number | null;
    activeStudents: number;
    durationSeconds: number;
    avgDurationSeconds: number | null;
    medianDurationSeconds: number | null;
    distanceMeters: number;
    avgDistanceMeters: number | null;
    drivesWithDistance: number;
  };
  driveBuckets: CountShare[];
  milestones: {
    journeys: number;
    atLeast1: number;
    atLeast2: number;
    atLeast5: number;
    atLeast10: number;
    withFirst: number;
    secondWithin7d: number;
    secondWithin14d: number;
    secondWithin30d: number;
    secondTotal: number;
    medianRegisterToFirstSeconds: number | null;
    medianFirstToSecondSeconds: number | null;
    medianSecondToFifthSeconds: number | null;
  };
  moments: {
    trainings: number;
    checkoffs: number;
    uniqueTrained: number;
    uniqueChecked: number;
    uniqueCompleted: number;
    avgTrainedPerDrive: number | null;
    medianTrainedPerDrive: number | null;
    avgCheckoffsPerDrive: number | null;
    drivesWithTraining: number;
    drivesWithoutTraining: number;
    drivesWithCheckoff: number;
    completedDrives: number;
  };
  skills: SkillUsageRow[];
  areas: AreaUsageRow[];
  progression: {
    buckets: CountShare[];
    averagePercent: number | null;
    medianPercent: number | null;
    averageDelta30d: number | null;
    increased30d: number;
    stalledActive30d: number;
    active30d: number;
  };
  activity: {
    period: StatsPeriod;
    unit: "day" | "week";
    points: ActivityPoint[];
  };
  retention: {
    byFirstDrive: RetentionCohort[];
    byRegistration: RetentionCohort[];
  };
  supervisorStats: {
    buckets: CountShare[];
    withActiveSupervisor: number;
    journeys: number;
    pendingInvites: number;
    journeysWithPendingInvite: number;
    participated: number;
    drivesPerParticipatingAvg: number | null;
    drivesPerParticipatingMedian: number | null;
    activeWithoutDrive: number;
  };
  features: {
    completedDrives: number;
    withFocus: number;
    withTraining: number;
    withCheckoff: number;
    events: Array<{ key: string; count: number }>;
  };
  stuck: {
    signals: Array<{ key: StuckSignal; count: number }>;
    journeysWithSignal: number;
  };
}

export interface TimelineEvent {
  at: string;
  label: string;
  detail: string;
}

export interface JourneyUsageDetail {
  journeyId: string;
  studentName: string;
  studentUserId: string;
  studentRemoved: boolean;
  createdAt: string;
  registeredAt: string;
  transmission: string;
  summary: {
    drives: number;
    durationSeconds: number;
    avgDurationSeconds: number | null;
    lastDriveAt: string | null;
    activeSupervisors: number;
    pendingInvites: number;
    uniqueSkills: number;
    checkoffs: number;
    fullChecklists: number;
    progressionPercent: number;
    status: string;
  };
  timeline: TimelineEvent[];
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shares(rows: Array<{ key: string; count: number }>, whole: number): CountShare[] {
  return rows.map((row) => ({
    key: row.key,
    count: row.count,
    percent: whole <= 0 ? 0 : Math.round((row.count / whole) * 100),
  }));
}

export async function loadUsageWindows(): Promise<UsageWindows> {
  const result = await getPool().query(
    `SELECT ${START_7} AS start7, ${START_14} AS start14, ${START_30} AS start30`,
  );
  const row = result.rows[0] ?? {};
  return {
    start7: new Date(String(row.start7)),
    start14: new Date(String(row.start14)),
    start30: new Date(String(row.start30)),
  };
}

export async function loadJourneyFacts(journeyIds?: string[]): Promise<JourneyFact[]> {
  const filter = journeyIds ? "WHERE j.id = ANY($1::uuid[])" : "";
  const params = journeyIds ? [journeyIds] : [];
  const result = await getPool().query(
    `WITH canonical AS (${CANONICAL}),
          latest AS (${LATEST_SKILL}),
          latest_then AS (${LATEST_SKILL_BEFORE_30}),
          applicable AS (${APPLICABLE}),
          drive_stats AS (
            SELECT
              d.journey_id,
              count(*) FILTER (WHERE d.ended_at IS NOT NULL)::int AS completed,
              count(*) FILTER (
                WHERE d.ended_at IS NOT NULL AND d.ended_at >= ${START_30}
              )::int AS completed_30,
              max(d.ended_at) FILTER (WHERE d.ended_at IS NOT NULL) AS last_completed,
              COALESCE(
                sum(EXTRACT(EPOCH FROM (d.ended_at - d.started_at)))
                  FILTER (WHERE d.ended_at IS NOT NULL),
                0
              )::float AS duration_seconds
            FROM drives d
            GROUP BY d.journey_id
          ),
          trained AS (
            SELECT
              c.journey_id,
              count(*)::int AS trainings,
              count(DISTINCT c.skill_id)::int AS unique_skills,
              COALESCE(sum(cardinality(c.completed_step_keys)), 0)::int AS checkoffs
            FROM canonical c
            JOIN drives d
              ON d.id = c.drive_id AND d.journey_id = c.journey_id
            WHERE d.ended_at IS NOT NULL
            GROUP BY c.journey_id
          ),
          progress AS (
            SELECT
              a.journey_id,
              count(*)::int AS skill_count,
              COALESCE(sum(${SCORE.replaceAll("assessment", "l.assessment")}), 0)::int AS points,
              COALESCE(sum(${SCORE.replaceAll("assessment", "t.assessment")}), 0)::int AS points_then
            FROM applicable a
            LEFT JOIN latest l
              ON l.journey_id = a.journey_id AND l.skill_id = a.skill_id
            LEFT JOIN latest_then t
              ON t.journey_id = a.journey_id AND t.skill_id = a.skill_id
            GROUP BY a.journey_id
          ),
          supervisors AS (
            SELECT journey_id,
                   count(*) FILTER (WHERE status = 'active')::int AS active
            FROM journey_collaborators
            WHERE role = 'supervisor'
            GROUP BY journey_id
          ),
          invites AS (
            SELECT journey_id,
                   count(*) FILTER (
                     WHERE status = 'pending' AND expires_at > now()
                   )::int AS pending
            FROM journey_invitations
            WHERE role = 'supervisor'
            GROUP BY journey_id
          )
     SELECT
       j.id,
       j.student_user_id,
       j.created_at,
       COALESCE(supervisors.active, 0)::int AS active_supervisors,
       COALESCE(invites.pending, 0)::int AS pending_invites,
       COALESCE(drive_stats.completed, 0)::int AS completed,
       COALESCE(drive_stats.completed_30, 0)::int AS completed_30,
       drive_stats.last_completed,
       COALESCE(drive_stats.duration_seconds, 0)::float AS duration_seconds,
       COALESCE(trained.trainings, 0)::int AS trainings,
       COALESCE(trained.unique_skills, 0)::int AS unique_skills,
       COALESCE(trained.checkoffs, 0)::int AS checkoffs,
       COALESCE(progress.points, 0)::int AS points,
       COALESCE(progress.points_then, 0)::int AS points_then,
       COALESCE(progress.skill_count, 0)::int AS skill_count
     FROM driving_journeys j
     LEFT JOIN drive_stats ON drive_stats.journey_id = j.id
     LEFT JOIN trained ON trained.journey_id = j.id
     LEFT JOIN progress ON progress.journey_id = j.id
     LEFT JOIN supervisors ON supervisors.journey_id = j.id
     LEFT JOIN invites ON invites.journey_id = j.id
     ${filter}`,
    params,
  );

  return result.rows.map((row) => {
    const skillCount = num(row.skill_count);
    const points = num(row.points);
    const pointsThen = num(row.points_then);
    return {
      journeyId: String(row.id),
      studentUserId: String(row.student_user_id),
      createdAt: new Date(String(row.created_at)).toISOString(),
      activeSupervisors: num(row.active_supervisors),
      pendingInvites: num(row.pending_invites),
      completedDrives: num(row.completed),
      drivesCompleted30d: num(row.completed_30),
      lastCompletedAt: iso(row.last_completed),
      durationSeconds: num(row.duration_seconds),
      trainedObservations: num(row.trainings),
      uniqueSkillsTrained: num(row.unique_skills),
      checkoffSteps: num(row.checkoffs),
      progressionPercent: readinessPercent(points, skillCount * 3),
      progressionPoints: points,
      progressionPointsAgo30: pointsThen,
      skillCount,
    };
  });
}

export function snapshotFromFact(fact: JourneyFact): UsageSnapshot {
  return {
    hasJourney: true,
    createdAt: new Date(fact.createdAt),
    activeSupervisors: fact.activeSupervisors,
    completedDrives: fact.completedDrives,
    lastCompletedAt: fact.lastCompletedAt ? new Date(fact.lastCompletedAt) : null,
    trainedObservations: fact.trainedObservations,
    checkoffSteps: fact.checkoffSteps,
    progressionPercent: fact.progressionPercent,
    progressionIncreased30d: fact.progressionPoints > fact.progressionPointsAgo30,
  };
}

function emptySignals(): Record<StuckSignal, number> {
  return Object.fromEntries(STUCK_SIGNALS.map((key) => [key, 0])) as Record<StuckSignal, number>;
}

async function headline() {
  const result = await getPool().query(
    `WITH bounds AS (
       SELECT ${START_7} AS start7, ${START_30} AS start30
     ),
     live_users AS (
       SELECT id, created_at, last_seen_at
       FROM users
       WHERE account_state <> 'deleted'
     ),
     drive_touch AS (
       SELECT j.student_user_id AS user_id, d.ended_at AS at
       FROM drives d
       JOIN driving_journeys j ON j.id = d.journey_id
       WHERE d.ended_at IS NOT NULL
       UNION ALL
       SELECT d.started_by_user_id, d.ended_at
       FROM drives d
       WHERE d.ended_at IS NOT NULL AND d.started_by_user_id IS NOT NULL
       UNION ALL
       SELECT d.supervisor_user_id, d.ended_at
       FROM drives d
       WHERE d.ended_at IS NOT NULL AND d.supervisor_user_id IS NOT NULL
     ),
     other_touch AS (
       SELECT user_id, created_at AS at
       FROM product_events
       WHERE user_id IS NOT NULL
       UNION ALL
       SELECT observer_user_id, observed_at
       FROM drive_observations
       WHERE observer_user_id IS NOT NULL
     )
     SELECT
       (SELECT count(*)::int FROM live_users) AS accounts,
       (SELECT count(*)::int FROM live_users u
        WHERE EXISTS (
          SELECT 1 FROM driving_journeys j WHERE j.student_user_id = u.id
        )) AS students,
       (SELECT count(*)::int FROM live_users u
        WHERE EXISTS (
          SELECT 1 FROM journey_collaborators c
          WHERE c.user_id = u.id AND c.role = 'supervisor' AND c.status = 'active'
        )) AS supervisors,
       (SELECT count(*)::int FROM driving_journeys) AS journeys,
       (SELECT count(*)::int FROM live_users u, bounds b WHERE u.created_at >= b.start7) AS new7,
       (SELECT count(*)::int FROM live_users u, bounds b WHERE u.created_at >= b.start30) AS new30,
       (SELECT count(DISTINCT u.id)::int
        FROM live_users u, bounds b
        WHERE u.last_seen_at >= b.start7
           OR EXISTS (
             SELECT 1 FROM drive_touch t WHERE t.user_id = u.id AND t.at >= b.start7
           )
           OR EXISTS (
             SELECT 1 FROM other_touch t WHERE t.user_id = u.id AND t.at >= b.start7
           )) AS active_users7,
       (SELECT count(DISTINCT u.id)::int
        FROM live_users u, bounds b
        WHERE u.last_seen_at >= b.start30
           OR EXISTS (
             SELECT 1 FROM drive_touch t WHERE t.user_id = u.id AND t.at >= b.start30
           )
           OR EXISTS (
             SELECT 1 FROM other_touch t WHERE t.user_id = u.id AND t.at >= b.start30
           )) AS active_users30,
       (SELECT count(DISTINCT d.journey_id)::int
        FROM drives d, bounds b
        WHERE d.ended_at IS NOT NULL AND d.ended_at >= b.start7) AS active_journeys7,
       (SELECT count(DISTINCT d.journey_id)::int
        FROM drives d, bounds b
        WHERE d.ended_at IS NOT NULL AND d.ended_at >= b.start30) AS active_journeys30,
       (SELECT count(*)::int FROM live_users u
        WHERE NOT EXISTS (SELECT 1 FROM driving_journeys j WHERE j.student_user_id = u.id)
          AND NOT EXISTS (
            SELECT 1 FROM journey_collaborators c
            WHERE c.user_id = u.id AND c.role = 'supervisor'
          )) AS without_journey`,
  );
  return result.rows[0] ?? {};
}

async function driveAggregates() {
  const result = await getPool().query(
    `WITH completed AS (
       SELECT
         d.ended_at,
         d.distance_meters,
         EXTRACT(EPOCH FROM (d.ended_at - d.started_at)) AS seconds,
         j.student_user_id
       FROM drives d
       JOIN driving_journeys j ON j.id = d.journey_id
       WHERE d.ended_at IS NOT NULL
     ),
     bounds AS (SELECT ${START_7} AS start7, ${START_30} AS start30)
     SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE ended_at >= start7)::int AS d7,
       count(*) FILTER (WHERE ended_at >= start30)::int AS d30,
       count(DISTINCT student_user_id) FILTER (WHERE ended_at >= start7)::int AS students7,
       count(DISTINCT student_user_id) FILTER (WHERE ended_at >= start30)::int AS students30,
       COALESCE(sum(seconds), 0)::float AS duration,
       avg(seconds)::float AS avg_seconds,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::float AS median_seconds,
       COALESCE(sum(distance_meters), 0)::float AS distance,
       avg(distance_meters)::float AS avg_distance,
       count(distance_meters)::int AS distance_drives
     FROM completed, bounds`,
  );
  return result.rows[0] ?? {};
}

async function milestoneTiming() {
  const result = await getPool().query(
    `WITH completed AS (
       SELECT
         d.journey_id,
         d.ended_at,
         row_number() OVER (PARTITION BY d.journey_id ORDER BY d.ended_at, d.id) AS n
       FROM drives d
       WHERE d.ended_at IS NOT NULL
     ),
     firsts AS (
       SELECT c.journey_id, c.ended_at AS first_at, u.created_at AS registered_at
       FROM completed c
       JOIN driving_journeys j ON j.id = c.journey_id
       JOIN users u ON u.id = j.student_user_id
       WHERE c.n = 1
     ),
     seconds AS (
       SELECT journey_id, ended_at AS second_at FROM completed WHERE n = 2
     ),
     fifths AS (
       SELECT journey_id, ended_at AS fifth_at FROM completed WHERE n = 5
     )
     SELECT
       count(*)::int AS with_first,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (f.first_at - f.registered_at))
       ) FILTER (WHERE f.first_at >= f.registered_at)::float AS reg_to_first,
       count(s.journey_id)::int AS with_second,
       count(*) FILTER (
         WHERE s.second_at <= f.first_at + interval '7 days'
       )::int AS second_7,
       count(*) FILTER (
         WHERE s.second_at <= f.first_at + interval '14 days'
       )::int AS second_14,
       count(*) FILTER (
         WHERE s.second_at <= f.first_at + interval '30 days'
       )::int AS second_30,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (s.second_at - f.first_at))
       ) FILTER (WHERE s.second_at IS NOT NULL)::float AS first_to_second,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (fifth.fifth_at - s.second_at))
       ) FILTER (WHERE fifth.fifth_at IS NOT NULL AND s.second_at IS NOT NULL)::float AS second_to_fifth
     FROM firsts f
     LEFT JOIN seconds s ON s.journey_id = f.journey_id
     LEFT JOIN fifths fifth ON fifth.journey_id = f.journey_id`,
  );
  return result.rows[0] ?? {};
}

async function momentAggregates() {
  const result = await getPool().query(
    `WITH canonical AS (${CANONICAL}),
          per_drive AS (
            SELECT
              d.id AS drive_id,
              d.journey_id,
              count(c.skill_id)::int AS trainings,
              COALESCE(sum(cardinality(c.completed_step_keys)), 0)::int AS checkoffs
            FROM drives d
            LEFT JOIN canonical c
              ON c.drive_id = d.id AND c.journey_id = d.journey_id
            WHERE d.ended_at IS NOT NULL
            GROUP BY d.id, d.journey_id
          ),
          skills_used AS (
            SELECT
              count(DISTINCT c.skill_id) FILTER (WHERE true)::int AS trained,
              count(DISTINCT c.skill_id) FILTER (
                WHERE cardinality(c.completed_step_keys) > 0
              )::int AS checked
            FROM canonical c
            JOIN drives d ON d.id = c.drive_id AND d.journey_id = c.journey_id
            WHERE d.ended_at IS NOT NULL
          )
     SELECT
       COALESCE(sum(trainings), 0)::int AS trainings,
       COALESCE(sum(checkoffs), 0)::int AS checkoffs,
       COALESCE((SELECT trained FROM skills_used), 0)::int AS unique_trained,
       COALESCE((SELECT checked FROM skills_used), 0)::int AS unique_checked,
       avg(trainings)::float AS avg_trained,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY trainings)::float AS median_trained,
       avg(checkoffs)::float AS avg_checkoffs,
       count(*) FILTER (WHERE trainings > 0)::int AS with_training,
       count(*) FILTER (WHERE trainings = 0)::int AS without_training,
       count(*) FILTER (WHERE checkoffs > 0)::int AS with_checkoff,
       count(*)::int AS completed
     FROM per_drive`,
  );
  return result.rows[0] ?? {};
}

async function skillRows(areaTitles: Map<string, string>): Promise<SkillUsageRow[]> {
  const catalog = coachingStepCatalog();
  const result = await getPool().query(
    `WITH canonical AS (${CANONICAL}),
          per_obs AS (
            SELECT
              c.skill_id,
              j.student_user_id,
              cardinality(c.completed_step_keys)::int AS steps,
              (
                SELECT count(DISTINCT key)::int
                FROM unnest(c.completed_step_keys) AS key
              ) AS distinct_steps
            FROM canonical c
            JOIN drives d
              ON d.id = c.drive_id AND d.journey_id = c.journey_id AND d.ended_at IS NOT NULL
            JOIN driving_journeys j ON j.id = c.journey_id
          ),
          expected AS (
            SELECT * FROM unnest($1::text[], $2::int[]) AS e(skill_key, step_count)
          )
     SELECT
       s.skill_key,
       sd.title,
       sd.area_key,
       sd.sort_order,
       count(p.skill_id)::int AS trainings,
       count(DISTINCT p.student_user_id)::int AS students_trained,
       COALESCE(sum(p.steps), 0)::int AS checkoffs,
       count(DISTINCT p.student_user_id) FILTER (WHERE p.steps > 0)::int AS students_checked,
       count(DISTINCT p.student_user_id) FILTER (
         WHERE COALESCE(e.step_count, 0) > 0 AND p.distinct_steps >= e.step_count
       )::int AS students_completed
     FROM skills s
     JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
     LEFT JOIN expected e ON e.skill_key = s.skill_key
     LEFT JOIN per_obs p ON p.skill_id = s.id
     GROUP BY s.skill_key, sd.title, sd.area_key, sd.sort_order
     ORDER BY trainings DESC, sd.sort_order, sd.title`,
    [catalog.map((row) => row.skillKey), catalog.map((row) => row.stepCount)],
  );
  return result.rows.map((row) => {
    const areaKey = String(row.area_key);
    return {
      skillKey: String(row.skill_key),
      title: String(row.title),
      areaKey,
      areaTitle: areaTitles.get(areaKey) ?? areaKey,
      trainings: num(row.trainings),
      studentsTrained: num(row.students_trained),
      checkoffs: num(row.checkoffs),
      studentsChecked: num(row.students_checked),
      studentsCompleted: num(row.students_completed),
    };
  });
}

async function areaRows(areaTitles: Map<string, string>, areaOrder: string[]): Promise<AreaUsageRow[]> {
  const result = await getPool().query(
    `WITH canonical AS (${CANONICAL}),
          latest AS (${LATEST_SKILL}),
          applicable AS (${APPLICABLE}),
          area_journey AS (
            SELECT
              a.journey_id,
              sd.area_key,
              count(*)::int AS skills,
              count(l.skill_id)::int AS trained_skills,
              count(*) FILTER (WHERE l.assessment = 'independent')::int AS independent_skills,
              COALESCE(sum(${SCORE.replaceAll("assessment", "l.assessment")}), 0)::int AS points
            FROM applicable a
            JOIN skill_definitions sd
              ON sd.skill_id = a.skill_id AND sd.taxonomy_version = 1
            LEFT JOIN latest l
              ON l.journey_id = a.journey_id AND l.skill_id = a.skill_id
            GROUP BY a.journey_id, sd.area_key
          ),
          area_usage AS (
            SELECT
              sd.area_key,
              count(*)::int AS trainings,
              COALESCE(sum(cardinality(c.completed_step_keys)), 0)::int AS checkoffs,
              count(DISTINCT j.student_user_id)::int AS students
            FROM canonical c
            JOIN drives d
              ON d.id = c.drive_id AND d.journey_id = c.journey_id AND d.ended_at IS NOT NULL
            JOIN driving_journeys j ON j.id = c.journey_id
            JOIN skill_definitions sd
              ON sd.skill_id = c.skill_id AND sd.taxonomy_version = 1
            GROUP BY sd.area_key
          )
     SELECT
       aj.area_key,
       count(*)::int AS journeys,
       count(*) FILTER (WHERE aj.trained_skills > 0)::int AS started,
       count(*) FILTER (
         WHERE aj.skills > 0 AND aj.independent_skills = aj.skills
       )::int AS completed,
       avg(aj.points * 100.0 / NULLIF(aj.skills * 3, 0))::float AS avg_percent,
       COALESCE(max(au.trainings), 0)::int AS trainings,
       COALESCE(max(au.checkoffs), 0)::int AS checkoffs,
       COALESCE(max(au.students), 0)::int AS students
     FROM area_journey aj
     LEFT JOIN area_usage au ON au.area_key = aj.area_key
     GROUP BY aj.area_key`,
  );
  const byKey = new Map(
    result.rows.map((row) => {
      const areaKey = String(row.area_key);
      return [
        areaKey,
        {
          areaKey,
          areaTitle: areaTitles.get(areaKey) ?? areaKey,
          trainings: num(row.trainings),
          checkoffs: num(row.checkoffs),
          students: num(row.students),
          averageProgressPercent: Math.round(num(row.avg_percent)),
          startedJourneys: num(row.started),
          completedJourneys: num(row.completed),
          journeys: num(row.journeys),
        } satisfies AreaUsageRow,
      ];
    }),
  );
  const ordered = areaOrder.filter((key) => byKey.has(key)).map((key) => byKey.get(key)!);
  for (const [key, row] of byKey) {
    if (!areaOrder.includes(key)) ordered.push(row);
  }
  return ordered;
}

async function activitySeries(period: StatsPeriod): Promise<{
  unit: "day" | "week";
  points: ActivityPoint[];
}> {
  const unit = period === "90" || period === "all" ? "week" : "day";
  const startSql =
    period === "7"
      ? START_7
      : period === "30"
        ? START_30
        : period === "90"
          ? START_90
          : `COALESCE(
              LEAST(
                (SELECT min(created_at) FROM users),
                (SELECT min(created_at) FROM driving_journeys),
                (SELECT min(ended_at) FROM drives WHERE ended_at IS NOT NULL)
              ),
              now()
            )`;
  const result = await getPool().query(
    `WITH params AS (
       SELECT ${startSql} AS start_at, $1::text AS unit
     ),
     buckets AS (
       SELECT generate_series(
         date_trunc(params.unit, params.start_at AT TIME ZONE 'Europe/Stockholm'),
         date_trunc(params.unit, now() AT TIME ZONE 'Europe/Stockholm'),
         CASE WHEN params.unit = 'week' THEN interval '1 week' ELSE interval '1 day' END
       )::date AS bucket
       FROM params
     ),
     new_users AS (
       SELECT date_trunc(params.unit, u.created_at AT TIME ZONE 'Europe/Stockholm')::date AS bucket,
              count(*)::int AS n
       FROM users u, params
       WHERE u.account_state <> 'deleted' AND u.created_at >= params.start_at
       GROUP BY 1
     ),
     active_users AS (
       SELECT bucket, count(*)::int AS n
       FROM (
         SELECT u.id AS user_id,
                date_trunc(params.unit, u.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date AS bucket
         FROM users u, params
         WHERE u.account_state <> 'deleted'
           AND u.last_seen_at IS NOT NULL
           AND u.last_seen_at >= params.start_at
         UNION
         SELECT j.student_user_id,
                date_trunc(params.unit, d.ended_at AT TIME ZONE 'Europe/Stockholm')::date
         FROM drives d
         JOIN driving_journeys j ON j.id = d.journey_id
         JOIN users u ON u.id = j.student_user_id AND u.account_state <> 'deleted'
         CROSS JOIN params
         WHERE d.ended_at IS NOT NULL AND d.ended_at >= params.start_at
         UNION
         SELECT d.started_by_user_id,
                date_trunc(params.unit, d.ended_at AT TIME ZONE 'Europe/Stockholm')::date
         FROM drives d
         JOIN users u ON u.id = d.started_by_user_id AND u.account_state <> 'deleted'
         CROSS JOIN params
         WHERE d.ended_at IS NOT NULL
           AND d.started_by_user_id IS NOT NULL
           AND d.ended_at >= params.start_at
         UNION
         SELECT d.supervisor_user_id,
                date_trunc(params.unit, d.ended_at AT TIME ZONE 'Europe/Stockholm')::date
         FROM drives d
         JOIN users u ON u.id = d.supervisor_user_id AND u.account_state <> 'deleted'
         CROSS JOIN params
         WHERE d.ended_at IS NOT NULL
           AND d.supervisor_user_id IS NOT NULL
           AND d.ended_at >= params.start_at
         UNION
         SELECT e.user_id,
                date_trunc(params.unit, e.created_at AT TIME ZONE 'Europe/Stockholm')::date
         FROM product_events e
         JOIN users u ON u.id = e.user_id AND u.account_state <> 'deleted'
         CROSS JOIN params
         WHERE e.user_id IS NOT NULL AND e.created_at >= params.start_at
         UNION
         SELECT o.observer_user_id,
                date_trunc(params.unit, o.observed_at AT TIME ZONE 'Europe/Stockholm')::date
         FROM drive_observations o
         JOIN users u ON u.id = o.observer_user_id AND u.account_state <> 'deleted'
         CROSS JOIN params
         WHERE o.observer_user_id IS NOT NULL AND o.observed_at >= params.start_at
       ) touches
       GROUP BY bucket
     ),
     active_journeys AS (
       SELECT date_trunc(params.unit, d.ended_at AT TIME ZONE 'Europe/Stockholm')::date AS bucket,
              count(DISTINCT d.journey_id)::int AS n
       FROM drives d, params
       WHERE d.ended_at IS NOT NULL AND d.ended_at >= params.start_at
       GROUP BY 1
     ),
     drive_buckets AS (
       SELECT date_trunc(params.unit, d.ended_at AT TIME ZONE 'Europe/Stockholm')::date AS bucket,
              count(*)::int AS n,
              COALESCE(sum(EXTRACT(EPOCH FROM (d.ended_at - d.started_at))), 0)::float AS seconds
       FROM drives d, params
       WHERE d.ended_at IS NOT NULL AND d.ended_at >= params.start_at
       GROUP BY 1
     ),
     training AS (
       SELECT date_trunc(params.unit, c.observed_at AT TIME ZONE 'Europe/Stockholm')::date AS bucket,
              count(*)::int AS trainings,
              COALESCE(sum(cardinality(c.completed_step_keys)), 0)::int AS checkoffs
       FROM (${CANONICAL}) c
       JOIN drives d ON d.id = c.drive_id AND d.journey_id = c.journey_id
       CROSS JOIN params
       WHERE d.ended_at IS NOT NULL AND c.observed_at >= params.start_at
       GROUP BY 1
     )
     SELECT
       buckets.bucket::text AS bucket,
       COALESCE(new_users.n, 0)::int AS new_users,
       COALESCE(active_users.n, 0)::int AS active_users,
       COALESCE(active_journeys.n, 0)::int AS active_journeys,
       COALESCE(drive_buckets.n, 0)::int AS drives,
       COALESCE(round(drive_buckets.seconds / 60.0), 0)::int AS duration_minutes,
       COALESCE(training.trainings, 0)::int AS trainings,
       COALESCE(training.checkoffs, 0)::int AS checkoffs
     FROM buckets
     LEFT JOIN new_users ON new_users.bucket = buckets.bucket
     LEFT JOIN active_users ON active_users.bucket = buckets.bucket
     LEFT JOIN active_journeys ON active_journeys.bucket = buckets.bucket
     LEFT JOIN drive_buckets ON drive_buckets.bucket = buckets.bucket
     LEFT JOIN training ON training.bucket = buckets.bucket
     ORDER BY buckets.bucket`,
    [unit],
  );
  return {
    unit,
    points: result.rows.map((row) => ({
      bucket: String(row.bucket),
      newUsers: num(row.new_users),
      activeUsers: num(row.active_users),
      activeJourneys: num(row.active_journeys),
      drives: num(row.drives),
      durationMinutes: num(row.duration_minutes),
      trainings: num(row.trainings),
      checkoffs: num(row.checkoffs),
    })),
  };
}

async function retentionCohorts(): Promise<{
  byFirstDrive: RetentionCohort[];
  byRegistration: RetentionCohort[];
}> {
  const result = await getPool().query(
    `WITH firsts AS (
       SELECT
         j.id AS journey_id,
         j.student_user_id,
         min(d.ended_at) AS first_at,
         date_trunc('week', min(d.ended_at) AT TIME ZONE 'Europe/Stockholm')::date AS cohort
       FROM driving_journeys j
       JOIN drives d ON d.journey_id = j.id AND d.ended_at IS NOT NULL
       GROUP BY j.id, j.student_user_id
     ),
     registered AS (
       SELECT DISTINCT ON (j.student_user_id)
         j.student_user_id,
         j.id AS journey_id,
         date_trunc('week', u.created_at AT TIME ZONE 'Europe/Stockholm')::date AS cohort
       FROM driving_journeys j
       JOIN users u ON u.id = j.student_user_id AND u.account_state <> 'deleted'
       ORDER BY j.student_user_id, j.created_at, j.id
     ),
     drive_weeks AS (
       SELECT
         f.journey_id::text AS journey_key,
         f.cohort,
         ((d.ended_at AT TIME ZONE 'Europe/Stockholm')::date - f.cohort) / 7 AS week_offset,
         'first'::text AS basis
       FROM firsts f
       JOIN drives d ON d.journey_id = f.journey_id AND d.ended_at IS NOT NULL
       UNION ALL
       SELECT
         r.student_user_id::text,
         r.cohort,
         ((d.ended_at AT TIME ZONE 'Europe/Stockholm')::date - r.cohort) / 7,
         'registered'
       FROM registered r
       JOIN driving_journeys j ON j.student_user_id = r.student_user_id
       JOIN drives d ON d.journey_id = j.id AND d.ended_at IS NOT NULL
     ),
     activity_weeks AS (
       SELECT journey_key, cohort, week_offset, basis
       FROM drive_weeks
       UNION
       SELECT f.journey_id::text, f.cohort,
              ((o.observed_at AT TIME ZONE 'Europe/Stockholm')::date - f.cohort) / 7,
              'first'
       FROM firsts f
       JOIN drive_observations o ON o.journey_id = f.journey_id
       UNION
       SELECT f.journey_id::text, f.cohort,
              ((e.created_at AT TIME ZONE 'Europe/Stockholm')::date - f.cohort) / 7,
              'first'
       FROM firsts f
       JOIN product_events e ON e.journey_id = f.journey_id
       UNION
       SELECT f.journey_id::text, f.cohort,
              ((u.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date - f.cohort) / 7,
              'first'
       FROM firsts f
       JOIN users u ON u.id = f.student_user_id
       WHERE u.last_seen_at IS NOT NULL
       UNION
       SELECT r.student_user_id::text, r.cohort,
              ((o.observed_at AT TIME ZONE 'Europe/Stockholm')::date - r.cohort) / 7,
              'registered'
       FROM registered r
       JOIN driving_journeys j ON j.student_user_id = r.student_user_id
       JOIN drive_observations o ON o.journey_id = j.id
       UNION
       SELECT r.student_user_id::text, r.cohort,
              ((e.created_at AT TIME ZONE 'Europe/Stockholm')::date - r.cohort) / 7,
              'registered'
       FROM registered r
       JOIN product_events e ON e.user_id = r.student_user_id
       UNION
       SELECT r.student_user_id::text, r.cohort,
              ((u.last_seen_at AT TIME ZONE 'Europe/Stockholm')::date - r.cohort) / 7,
              'registered'
       FROM registered r
       JOIN users u ON u.id = r.student_user_id
       WHERE u.last_seen_at IS NOT NULL
     ),
     sizes AS (
       SELECT cohort::text AS cohort, count(*)::int AS size, 'first'::text AS basis
       FROM firsts
       GROUP BY cohort
       UNION ALL
       SELECT cohort::text, count(*)::int, 'registered'
       FROM registered
       GROUP BY cohort
     )
     SELECT 'size'::text AS row_kind, basis, cohort, size, NULL::int AS week_offset, NULL::text AS journey_key
     FROM sizes
     UNION ALL
     SELECT 'drive', basis, cohort::text, NULL::int, week_offset, journey_key
     FROM drive_weeks
     WHERE week_offset BETWEEN 0 AND 4
     UNION ALL
     SELECT 'activity', basis, cohort::text, NULL::int, week_offset, journey_key
     FROM activity_weeks
     WHERE week_offset BETWEEN 0 AND 4`,
  );

  const today = await getPool().query(
    `SELECT (now() AT TIME ZONE 'Europe/Stockholm')::date::text AS today`,
  );
  const todayText = String(today.rows[0]?.today ?? "");

  return {
    byFirstDrive: pivotRetention(result.rows, "first", todayText),
    byRegistration: pivotRetention(result.rows, "registered", todayText),
  };
}

function pivotRetention(
  rows: Array<Record<string, unknown>>,
  basis: string,
  today: string,
): RetentionCohort[] {
  const sizes = new Map<string, number>();
  const drive = new Map<string, Set<string>[]>();
  const activity = new Map<string, Set<string>[]>();
  for (const row of rows) {
    if (String(row.basis) !== basis) continue;
    const cohort = String(row.cohort);
    if (String(row.row_kind) === "size") {
      sizes.set(cohort, num(row.size));
      continue;
    }
    const offset = num(row.week_offset);
    if (offset < 0 || offset > 4) continue;
    const target = String(row.row_kind) === "drive" ? drive : activity;
    const weeks = target.get(cohort) ?? [new Set(), new Set(), new Set(), new Set(), new Set()];
    weeks[offset]?.add(String(row.journey_key));
    target.set(cohort, weeks);
  }
  const cohorts = [...sizes.keys()].sort();
  const recent = cohorts.slice(-12);
  return recent.map((week) => {
    const size = sizes.get(week) ?? 0;
    const cells = (source: Map<string, Set<string>[]>) =>
      Array.from({ length: 5 }, (_, offset) => {
        const start = addDays(week, offset * 7);
        const started = start <= today;
        const retained = source.get(week)?.[offset]?.size ?? 0;
        return {
          rate: !started || size === 0 ? null : Math.round((retained / size) * 100),
          retained: started ? retained : 0,
          size,
        };
      });
    return {
      week,
      size,
      drive: cells(drive),
      activity: cells(activity),
    };
  });
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

async function supervisorAggregates() {
  const sized = await getPool().query(
    `SELECT
       count(*) FILTER (WHERE n = 0)::int AS s0,
       count(*) FILTER (WHERE n = 1)::int AS s1,
       count(*) FILTER (WHERE n = 2)::int AS s2,
       count(*) FILTER (WHERE n >= 3)::int AS s3,
       count(*)::int AS journeys,
       count(*) FILTER (WHERE n >= 1)::int AS with_supervisor
     FROM (
       SELECT j.id, count(c.id) FILTER (WHERE c.status = 'active')::int AS n
       FROM driving_journeys j
       LEFT JOIN journey_collaborators c
         ON c.journey_id = j.id AND c.role = 'supervisor'
       GROUP BY j.id
     ) sized`,
  );
  const invites = await getPool().query(
    `SELECT count(*)::int AS pending,
            count(DISTINCT journey_id)::int AS journeys
     FROM journey_invitations
     WHERE role = 'supervisor' AND status = 'pending' AND expires_at > now()`,
  );
  const participated = await getPool().query(
    `WITH per_supervisor AS (
       SELECT d.supervisor_user_id AS user_id, count(*)::int AS n
       FROM drives d
       JOIN driving_journeys j ON j.id = d.journey_id
       WHERE d.ended_at IS NOT NULL
         AND d.supervisor_user_id IS NOT NULL
         AND d.supervisor_user_id <> j.student_user_id
       GROUP BY d.supervisor_user_id
     )
     SELECT
       count(*)::int AS participated,
       avg(n)::float AS avg_drives,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::float AS median_drives
     FROM per_supervisor`,
  );
  const idle = await getPool().query(
    `SELECT count(*)::int AS n
     FROM (
       SELECT DISTINCT c.user_id
       FROM journey_collaborators c
       JOIN users u ON u.id = c.user_id AND u.account_state <> 'deleted'
       WHERE c.role = 'supervisor' AND c.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM drives d
           WHERE d.ended_at IS NOT NULL AND d.supervisor_user_id = c.user_id
         )
     ) idle`,
  );
  return {
    sized: sized.rows[0] ?? {},
    invites: invites.rows[0] ?? {},
    participated: participated.rows[0] ?? {},
    idle: idle.rows[0] ?? {},
  };
}

async function featureUsage() {
  const drives = await getPool().query(
    `WITH canonical AS (${CANONICAL})
     SELECT
       count(*) FILTER (WHERE d.ended_at IS NOT NULL)::int AS completed,
       count(*) FILTER (
         WHERE d.ended_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM drive_focus_skills f
           WHERE f.drive_id = d.id AND f.journey_id = d.journey_id
         )
       )::int AS with_focus,
       count(*) FILTER (
         WHERE d.ended_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM canonical c
           WHERE c.drive_id = d.id AND c.journey_id = d.journey_id
         )
       )::int AS with_training,
       count(*) FILTER (
         WHERE d.ended_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM canonical c
           WHERE c.drive_id = d.id AND c.journey_id = d.journey_id
             AND cardinality(c.completed_step_keys) > 0
         )
       )::int AS with_checkoff
     FROM drives d`,
  );
  const events = await getPool().query(
    `SELECT event_name, count(*)::int AS n
     FROM product_events
     WHERE event_name IN (
       'drive_focus_saved',
       'drive_started',
       'drive_completed',
       'rating_completed',
       'recap_viewed',
       'training_guidance_opened',
       'next_drive_plan_created',
       'next_drive_plan_updated'
     )
     GROUP BY event_name`,
  );
  const wanted = [
    "drive_focus_saved",
    "drive_started",
    "drive_completed",
    "rating_completed",
    "recap_viewed",
    "training_guidance_opened",
    "next_drive_plan_created",
    "next_drive_plan_updated",
  ];
  const counts = new Map(events.rows.map((row) => [String(row.event_name), num(row.n)]));
  return {
    drives: drives.rows[0] ?? {},
    events: wanted.map((key) => ({ key, count: counts.get(key) ?? 0 })),
  };
}

function perActiveStudent(facts: JourneyFact[]): {
  avg: number | null;
  median: number | null;
  activeStudents: number;
} {
  const byStudent = new Map<string, number>();
  for (const fact of facts) {
    byStudent.set(
      fact.studentUserId,
      (byStudent.get(fact.studentUserId) ?? 0) + fact.completedDrives,
    );
  }
  const counts = [...byStudent.values()].filter((count) => count > 0);
  if (counts.length === 0) return { avg: null, median: null, activeStudents: 0 };
  const total = counts.reduce((sum, count) => sum + count, 0);
  return {
    avg: total / counts.length,
    median: median(counts),
    activeStudents: counts.length,
  };
}

function uniqueCompletedSkills(skills: SkillUsageRow[]): number {
  return skills.filter((skill) => skill.studentsCompleted > 0).length;
}

export async function getAdminProductStats(period: StatsPeriod = "30"): Promise<AdminProductStats> {
  const skills = await listSkillsForTaxonomy();
  const areaTitles = new Map(skills.map((skill) => [skill.areaKey, skill.areaTitle]));
  const areaOrder: string[] = [];
  for (const skill of skills) {
    if (!areaOrder.includes(skill.areaKey)) areaOrder.push(skill.areaKey);
  }

  const [
    windows,
    facts,
    heads,
    drives,
    timing,
    moments,
    skillUsage,
    areas,
    activity,
    retention,
    supervisors,
    features,
  ] = await Promise.all([
    loadUsageWindows(),
    loadJourneyFacts(),
    headline(),
    driveAggregates(),
    milestoneTiming(),
    momentAggregates(),
    skillRows(areaTitles),
    areaRows(areaTitles, areaOrder),
    activitySeries(period),
    retentionCohorts(),
    supervisorAggregates(),
    featureUsage(),
  ]);

  const bucketCounts = new Map<DriveCountBucket, number>(
    DRIVE_COUNT_BUCKETS.map((key) => [key, 0]),
  );
  const progressCounts = new Map<ProgressBucket, number>(PROGRESS_BUCKETS.map((key) => [key, 0]));
  const signals = emptySignals();
  let journeysWithSignal = 0;
  const percents: number[] = [];
  const deltas: number[] = [];
  let increased30d = 0;
  let stalledActive30d = 0;
  let active30d = 0;
  let atLeast1 = 0;
  let atLeast2 = 0;
  let atLeast5 = 0;
  let atLeast10 = 0;

  for (const fact of facts) {
    bucketCounts.set(
      driveCountBucket(fact.completedDrives),
      (bucketCounts.get(driveCountBucket(fact.completedDrives)) ?? 0) + 1,
    );
    progressCounts.set(
      progressBucket(fact.progressionPercent),
      (progressCounts.get(progressBucket(fact.progressionPercent)) ?? 0) + 1,
    );
    percents.push(fact.progressionPercent);
    const ago = readinessPercent(fact.progressionPointsAgo30, fact.skillCount * 3);
    deltas.push(fact.progressionPercent - ago);
    if (fact.progressionPoints > fact.progressionPointsAgo30) increased30d += 1;
    if (fact.drivesCompleted30d > 0) {
      active30d += 1;
      if (
        fact.progressionPoints <= fact.progressionPointsAgo30 &&
        fact.progressionPercent < 100
      ) {
        stalledActive30d += 1;
      }
    }
    if (fact.completedDrives >= 1) atLeast1 += 1;
    if (fact.completedDrives >= 2) atLeast2 += 1;
    if (fact.completedDrives >= 5) atLeast5 += 1;
    if (fact.completedDrives >= 10) atLeast10 += 1;
    const matched = stuckSignals(snapshotFromFact(fact), windows);
    if (matched.length > 0) journeysWithSignal += 1;
    for (const signal of matched) signals[signal] += 1;
  }
  signals.no_journey = num(heads.without_journey);

  const journeyCount = facts.length;
  const studentDrives = perActiveStudent(facts);
  const sized = supervisors.sized;
  const supervisorWhole = num(sized.journeys);

  return {
    windows,
    accounts: num(heads.accounts),
    students: num(heads.students),
    supervisors: num(heads.supervisors),
    journeys: num(heads.journeys),
    newAccounts7d: num(heads.new7),
    newAccounts30d: num(heads.new30),
    activeUsers7d: num(heads.active_users7),
    activeUsers30d: num(heads.active_users30),
    activeJourneys7d: num(heads.active_journeys7),
    activeJourneys30d: num(heads.active_journeys30),
    accountsWithoutJourney: num(heads.without_journey),
    drives: {
      total: num(drives.total),
      last7d: num(drives.d7),
      last30d: num(drives.d30),
      students7d: num(drives.students7),
      students30d: num(drives.students30),
      perActiveStudentAvg: studentDrives.avg,
      perActiveStudentMedian: studentDrives.median,
      activeStudents: studentDrives.activeStudents,
      durationSeconds: num(drives.duration),
      avgDurationSeconds: numOrNull(drives.avg_seconds),
      medianDurationSeconds: numOrNull(drives.median_seconds),
      distanceMeters: num(drives.distance),
      avgDistanceMeters: numOrNull(drives.avg_distance),
      drivesWithDistance: num(drives.distance_drives),
    },
    driveBuckets: shares(
      DRIVE_COUNT_BUCKETS.map((key) => ({ key, count: bucketCounts.get(key) ?? 0 })),
      journeyCount,
    ),
    milestones: {
      journeys: journeyCount,
      atLeast1,
      atLeast2,
      atLeast5,
      atLeast10,
      withFirst: num(timing.with_first),
      secondWithin7d: num(timing.second_7),
      secondWithin14d: num(timing.second_14),
      secondWithin30d: num(timing.second_30),
      secondTotal: num(timing.with_second),
      medianRegisterToFirstSeconds: numOrNull(timing.reg_to_first),
      medianFirstToSecondSeconds: numOrNull(timing.first_to_second),
      medianSecondToFifthSeconds: numOrNull(timing.second_to_fifth),
    },
    moments: {
      trainings: num(moments.trainings),
      checkoffs: num(moments.checkoffs),
      uniqueTrained: num(moments.unique_trained),
      uniqueChecked: num(moments.unique_checked),
      uniqueCompleted: uniqueCompletedSkills(skillUsage),
      avgTrainedPerDrive: numOrNull(moments.avg_trained),
      medianTrainedPerDrive: numOrNull(moments.median_trained),
      avgCheckoffsPerDrive: numOrNull(moments.avg_checkoffs),
      drivesWithTraining: num(moments.with_training),
      drivesWithoutTraining: num(moments.without_training),
      drivesWithCheckoff: num(moments.with_checkoff),
      completedDrives: num(moments.completed),
    },
    skills: skillUsage,
    areas,
    progression: {
      buckets: shares(
        PROGRESS_BUCKETS.map((key) => ({ key, count: progressCounts.get(key) ?? 0 })),
        journeyCount,
      ),
      averagePercent: percents.length === 0 ? null : percents.reduce((a, b) => a + b, 0) / percents.length,
      medianPercent: median(percents),
      averageDelta30d: deltas.length === 0 ? null : deltas.reduce((a, b) => a + b, 0) / deltas.length,
      increased30d,
      stalledActive30d,
      active30d,
    },
    activity: { period, unit: activity.unit, points: activity.points },
    retention,
    supervisorStats: {
      buckets: shares(
        [
          { key: "0", count: num(sized.s0) },
          { key: "1", count: num(sized.s1) },
          { key: "2", count: num(sized.s2) },
          { key: "3+", count: num(sized.s3) },
        ],
        supervisorWhole,
      ),
      withActiveSupervisor: num(sized.with_supervisor),
      journeys: supervisorWhole,
      pendingInvites: num(supervisors.invites.pending),
      journeysWithPendingInvite: num(supervisors.invites.journeys),
      participated: num(supervisors.participated.participated),
      drivesPerParticipatingAvg: numOrNull(supervisors.participated.avg_drives),
      drivesPerParticipatingMedian: numOrNull(supervisors.participated.median_drives),
      activeWithoutDrive: num(supervisors.idle.n),
    },
    features: {
      completedDrives: num(features.drives.completed),
      withFocus: num(features.drives.with_focus),
      withTraining: num(features.drives.with_training),
      withCheckoff: num(features.drives.with_checkoff),
      events: features.events,
    },
    stuck: {
      signals: STUCK_SIGNALS.map((key) => ({ key, count: signals[key] })),
      journeysWithSignal,
    },
  };
}

const FEATURE_LABELS: Record<string, string> = {
  drive_focus_saved: "Moment valda till ett pass",
  drive_started: "Körpass startat",
  drive_completed: "Körpass avslutat",
  rating_completed: "Bedömning sparad",
  recap_viewed: "Recap visad",
  training_guidance_opened: "Övningsguide öppnad",
  next_drive_plan_created: "Plan för nästa pass skapad",
  next_drive_plan_updated: "Plan för nästa pass uppdaterad",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key;
}

export async function getJourneyUsageDetail(journeyId: string): Promise<JourneyUsageDetail | null> {
  const pool = getPool();
  const journey = await pool.query(
    `SELECT j.id, j.created_at, j.transmission_scope::text AS transmission,
            u.id AS student_id, u.display_name, u.account_state::text AS state, u.created_at AS registered_at
     FROM driving_journeys j
     JOIN users u ON u.id = j.student_user_id
     WHERE j.id = $1`,
    [journeyId],
  );
  if (journey.rowCount === 0) return null;
  const row = journey.rows[0];
  const removed = String(row.state) === "deleted";

  const [facts, windows, invites, collaborators, drives, observations] = await Promise.all([
    loadJourneyFacts([journeyId]),
    loadUsageWindows(),
    pool.query(
      `SELECT i.created_at, i.accepted_at, i.status::text AS status, i.updated_at,
              u.display_name, u.account_state::text AS state
       FROM journey_invitations i
       LEFT JOIN users u ON u.id = i.accepted_by_user_id
       WHERE i.journey_id = $1 AND i.role = 'supervisor'
       ORDER BY i.created_at, i.id`,
      [journeyId],
    ),
    pool.query(
      `SELECT c.created_at, c.updated_at, c.status::text AS status,
              u.display_name, u.account_state::text AS state
       FROM journey_collaborators c
       JOIN users u ON u.id = c.user_id
       WHERE c.journey_id = $1 AND c.role = 'supervisor'
       ORDER BY c.created_at, c.id`,
      [journeyId],
    ),
    pool.query(
      `SELECT id, started_at, ended_at, distance_meters
       FROM drives
       WHERE journey_id = $1
       ORDER BY started_at, id`,
      [journeyId],
    ),
    pool.query(
      `WITH canonical AS (${CANONICAL})
       SELECT c.drive_id, c.skill_id, c.assessment::text AS assessment,
              c.completed_step_keys, c.observed_at, s.skill_key, sd.title
       FROM canonical c
       JOIN skills s ON s.id = c.skill_id
       JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
       WHERE c.journey_id = $1
       ORDER BY c.observed_at, sd.sort_order`,
      [journeyId],
    ),
  ]);

  const fact = facts[0];
  const snapshot = fact
    ? snapshotFromFact(fact)
    : {
        hasJourney: true,
        createdAt: new Date(String(row.created_at)),
        activeSupervisors: 0,
        completedDrives: 0,
        lastCompletedAt: null,
        trainedObservations: 0,
        checkoffSteps: 0,
        progressionPercent: 0,
        progressionIncreased30d: false,
      };
  const status = journeyUsageStatus(snapshot, windows);
  const catalog = new Map(coachingStepCatalog().map((item) => [item.skillKey, item.stepCount]));
  let fullChecklists = 0;
  const timeline: TimelineEvent[] = [
    {
      at: new Date(String(row.registered_at)).toISOString(),
      label: "Konto skapat",
      detail: removed ? "Tidigare elev" : "Elevkontot skapades",
    },
    {
      at: new Date(String(row.created_at)).toISOString(),
      label: "Resa skapad",
      detail: "Körkortsresan skapades",
    },
  ];

  for (const invite of invites.rows) {
    timeline.push({
      at: new Date(String(invite.created_at)).toISOString(),
      label: "Handledare inbjuden",
      detail: "Inbjudan skickad",
    });
  }

  for (const person of collaborators.rows) {
    const name = personLabel(person.state, person.display_name, "Handledare");
    timeline.push({
      at: new Date(String(person.created_at)).toISOString(),
      label: "Handledare ansluten",
      detail: name,
    });
    if (String(person.status) === "removed") {
      timeline.push({
        at: new Date(String(person.updated_at)).toISOString(),
        label: "Handledare borttagen",
        detail: name,
      });
    }
  }

  const driveNumber = new Map<string, number>();
  drives.rows.forEach((drive, index) => {
    driveNumber.set(String(drive.id), index + 1);
    const n = index + 1;
    timeline.push({
      at: new Date(String(drive.started_at)).toISOString(),
      label: `Körpass ${n} startat`,
      detail: drive.ended_at ? "Passet startade" : "Pågår och räknas inte som genomfört",
    });
    if (drive.ended_at) {
      const seconds =
        (new Date(String(drive.ended_at)).getTime() - new Date(String(drive.started_at)).getTime()) /
        1000;
      const distance =
        drive.distance_meters == null ? "" : ` · ${formatMeters(num(drive.distance_meters))}`;
      timeline.push({
        at: new Date(String(drive.ended_at)).toISOString(),
        label: `Körpass ${n} genomfört`,
        detail: `${formatMinutes(seconds)}${distance}`,
      });
    }
  });

  const completedDriveIds = new Set(
    drives.rows.filter((drive) => drive.ended_at).map((drive) => String(drive.id)),
  );
  for (const obs of observations.rows) {
    const driveId = String(obs.drive_id);
    if (!completedDriveIds.has(driveId)) continue;
    const n = driveNumber.get(driveId) ?? 0;
    const steps = Array.isArray(obs.completed_step_keys) ? obs.completed_step_keys.length : 0;
    const distinct = new Set(
      Array.isArray(obs.completed_step_keys) ? obs.completed_step_keys.map(String) : [],
    );
    const expected = catalog.get(String(obs.skill_key)) ?? 0;
    if (expected > 0 && distinct.size >= expected) fullChecklists += 1;
    timeline.push({
      at: new Date(String(obs.observed_at)).toISOString(),
      label: "Moment tränat",
      detail: `${obs.title} · körpass ${n} · ${assessmentLabel(String(obs.assessment))}`,
    });
    if (steps > 0) {
      timeline.push({
        at: new Date(String(obs.observed_at)).toISOString(),
        label: "Moment avbockat",
        detail:
          expected > 0 && distinct.size >= expected
            ? `${obs.title} · hela checklistan (${distinct.size} steg)`
            : `${obs.title} · ${distinct.size} körsteg`,
      });
    }
  }

  timeline.sort((a, b) => a.at.localeCompare(b.at) || a.label.localeCompare(b.label, "sv"));
  const completed = drives.rows.filter((drive) => drive.ended_at).length;
  const duration = fact?.durationSeconds ?? 0;

  return {
    journeyId,
    studentName: removed ? "Tidigare elev" : String(row.display_name || "Elev").trim() || "Elev",
    studentUserId: String(row.student_id),
    studentRemoved: removed,
    createdAt: new Date(String(row.created_at)).toISOString(),
    registeredAt: new Date(String(row.registered_at)).toISOString(),
    transmission: String(row.transmission),
    summary: {
      drives: completed,
      durationSeconds: duration,
      avgDurationSeconds: completed > 0 ? duration / completed : null,
      lastDriveAt: fact?.lastCompletedAt ?? null,
      activeSupervisors: fact?.activeSupervisors ?? 0,
      pendingInvites: fact?.pendingInvites ?? 0,
      uniqueSkills: fact?.uniqueSkillsTrained ?? 0,
      checkoffs: fact?.checkoffSteps ?? 0,
      fullChecklists,
      progressionPercent: fact?.progressionPercent ?? 0,
      status: status,
    },
    timeline,
  };
}

function personLabel(state: unknown, name: unknown, fallback: string): string {
  if (state === "deleted") {
    return fallback === "Handledare" ? "Tidigare handledare" : "Tidigare elev";
  }
  const text = typeof name === "string" ? name.trim() : "";
  return text || fallback;
}

function assessmentLabel(level: string): string {
  if (level === "needs_help") return "Behöver hjälp";
  if (level === "with_support") return "Med påminnelse";
  if (level === "independent") return "Utan hjälp";
  return level;
}

function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins} min`;
  if (mins === 0) return `${hours} tim`;
  return `${hours} tim ${mins} min`;
}

function formatMeters(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(km >= 10 ? 0 : 1).replace(".", ",")} km`;
}
