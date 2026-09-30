import { getPool } from "../db/pool.js";

/** HTML shows the most recently active journeys. CSV uses the same cap. */
export const USAGE_JOURNEY_LIMIT = 500;

export const USAGE_SOURCES = ["direct", "parent_handoff", "unknown"] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export const USAGE_STAGES = ["unknown", "just_started", "building", "near_test"] as const;
export type UsageStage = (typeof USAGE_STAGES)[number];

export const USAGE_TRANSMISSIONS = ["unknown", "manual", "automatic_only"] as const;
export type UsageTransmission = (typeof USAGE_TRANSMISSIONS)[number];

export const USAGE_SUPERVISOR_BUCKETS = ["0", "1", "2+"] as const;
export type UsageSupervisorBucket = (typeof USAGE_SUPERVISOR_BUCKETS)[number];

export const USAGE_FURTHEST = ["journey", "supervisor", "drive", "rated", "second"] as const;
export type UsageFurthest = (typeof USAGE_FURTHEST)[number];

export const USAGE_ASSESSMENTS = ["needs_help", "with_support", "independent"] as const;

export const USAGE_ENVIRONMENTS = ["residential", "urban", "rural", "highway"] as const;
export const USAGE_LIGHT = ["daylight", "dusk_dawn", "night"] as const;
export const USAGE_WEATHER = ["dry", "rain", "snow_ice", "fog"] as const;
export const USAGE_TRAFFIC = ["light", "moderate", "heavy"] as const;

/** Event rows are volumes, not unique people. */
export const USAGE_EVENT_NAMES = [
  "onboarding_student",
  "onboarding_supervisor",
  "student_handoff_started",
  "recap_viewed",
  "next_drive_plan_created",
  "next_drive_plan_updated",
  "training_guidance_opened",
  "stale_drive_nudge_shown",
] as const;
export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export interface UsageCount {
  key: string;
  count: number;
}

export interface UsageSkill {
  title: string;
  drives: number;
}

export interface UsagePerson {
  userId: string;
  name: string;
  removed: boolean;
}

export interface UsageJourney {
  journeyId: string;
  student: UsagePerson;
  supervisors: UsagePerson[];
  createdAt: string;
  lastActivityAt: string;
  source: UsageSource;
  practiceStage: UsageStage;
  transmission: UsageTransmission;
  activeSupervisors: number;
  drivesStarted: number;
  drivesCompleted: number;
  ratedDrives: number;
  furthest: UsageFurthest;
  waitlist: { id: string; status: string } | null;
}

export interface AdminUsage {
  journeys: UsageJourney[];
  journeyTotal: number;
  accountsWithoutJourney: number;
  studentAccounts: number;
  supervisorAccounts: number;
  bySource: UsageCount[];
  byPracticeStage: UsageCount[];
  byTransmission: UsageCount[];
  bySupervisorCount: UsageCount[];
  drivesStartedByStudent: number;
  drivesStartedBySupervisor: number;
  byAssessment: UsageCount[];
  focusSkills: UsageSkill[];
  otherFocusSkills: number;
  byEnvironment: UsageCount[];
  environmentMissing: number;
  byLight: UsageCount[];
  lightMissing: number;
  byWeather: UsageCount[];
  weatherMissing: number;
  byTraffic: UsageCount[];
  trafficMissing: number;
  events: UsageCount[];
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function fill(keys: readonly string[], rows: UsageCount[]): UsageCount[] {
  const counts = new Map(rows.map((row) => [row.key, row.count]));
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

function asSource(value: unknown): UsageSource {
  return USAGE_SOURCES.includes(value as UsageSource) ? (value as UsageSource) : "unknown";
}

function asStage(value: unknown): UsageStage {
  return USAGE_STAGES.includes(value as UsageStage) ? (value as UsageStage) : "unknown";
}

function asTransmission(value: unknown): UsageTransmission {
  return USAGE_TRANSMISSIONS.includes(value as UsageTransmission)
    ? (value as UsageTransmission)
    : "unknown";
}

function furthest(ratedDrives: number, drivesStarted: number, activeSupervisors: number): UsageFurthest {
  if (ratedDrives >= 2) return "second";
  if (ratedDrives >= 1) return "rated";
  if (drivesStarted >= 1) return "drive";
  if (activeSupervisors >= 1) return "supervisor";
  return "journey";
}

function personName(deleted: boolean, displayName: unknown, fallback: string): string {
  if (deleted) return fallback;
  const name = typeof displayName === "string" ? displayName.trim() : "";
  return name || fallback;
}

interface SupervisorJson {
  userId?: string;
  name?: string;
  status?: string;
}

function supervisorsFrom(value: unknown): UsagePerson[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((row) => {
    const item = row as SupervisorJson;
    if (!item.userId) return [];
    return [
      {
        userId: String(item.userId),
        name: item.name?.trim() || "Handledare",
        removed: item.status === "removed",
      },
    ];
  });
}

const JOURNEY_SQL = `
  WITH supervisors AS (
    SELECT
      c.journey_id,
      count(*) FILTER (WHERE c.status = 'active')::int AS active_supervisors,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'userId', u.id,
            'name', CASE
              WHEN u.account_state = 'deleted' THEN 'Tidigare handledare'
              ELSE COALESCE(NULLIF(btrim(u.display_name), ''), 'Handledare')
            END,
            'status', c.status
          )
          ORDER BY c.created_at, u.id
        ),
        '[]'::jsonb
      ) AS people
    FROM journey_collaborators c
    JOIN users u ON u.id = c.user_id
    WHERE c.role = 'supervisor'
    GROUP BY c.journey_id
  ),
  drive_stats AS (
    SELECT
      d.journey_id,
      count(*)::int AS drives_started,
      count(*) FILTER (WHERE d.ended_at IS NOT NULL)::int AS drives_completed,
      count(*) FILTER (
        WHERE d.ended_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM drive_observations o
            WHERE o.drive_id = d.id
              AND o.journey_id = d.journey_id
              AND o.source_type = 'supervisor'
              AND NOT EXISTS (
                SELECT 1
                FROM drive_observations newer
                WHERE newer.supersedes_observation_id = o.id
                  AND newer.journey_id = o.journey_id
              )
          )
      )::int AS rated_drives,
      max(COALESCE(d.ended_at, d.started_at)) AS last_drive_at
    FROM drives d
    GROUP BY d.journey_id
  ),
  sources AS (
    SELECT DISTINCT ON (journey_id)
      journey_id,
      event_source
    FROM product_events
    WHERE event_name = 'journey_created'
      AND journey_id IS NOT NULL
    ORDER BY journey_id, created_at DESC
  )
  SELECT
    j.id,
    j.created_at,
    j.practice_stage::text AS practice_stage,
    j.transmission_scope::text AS transmission,
    stu.id AS student_id,
    stu.account_state::text AS student_state,
    stu.display_name AS student_name,
    sources.event_source,
    COALESCE(supervisors.active_supervisors, 0)::int AS active_supervisors,
    COALESCE(supervisors.people, '[]'::jsonb) AS supervisors,
    COALESCE(drive_stats.drives_started, 0)::int AS drives_started,
    COALESCE(drive_stats.drives_completed, 0)::int AS drives_completed,
    COALESCE(drive_stats.rated_drives, 0)::int AS rated_drives,
    COALESCE(drive_stats.last_drive_at, j.created_at) AS last_activity_at,
    count(*) OVER ()::int AS journey_total
  FROM driving_journeys j
  JOIN users stu ON stu.id = j.student_user_id
  LEFT JOIN supervisors ON supervisors.journey_id = j.id
  LEFT JOIN drive_stats ON drive_stats.journey_id = j.id
  LEFT JOIN sources ON sources.journey_id = j.id
  ORDER BY last_activity_at DESC, j.created_at DESC, j.id DESC
  LIMIT ${USAGE_JOURNEY_LIMIT}
`;

export async function getAdminUsage(): Promise<AdminUsage> {
  const pool = getPool();
  const [
    journeysResult,
    accounts,
    sourceRows,
    stageRows,
    transmissionRows,
    supervisorRows,
    starters,
    assessmentRows,
    skillRows,
    contextRow,
    eventRows,
  ] = await Promise.all([
    pool.query(JOURNEY_SQL),
    pool.query(
      `SELECT
         count(*) FILTER (
           WHERE account_state <> 'deleted'
             AND NOT EXISTS (SELECT 1 FROM driving_journeys j WHERE j.student_user_id = users.id)
             AND NOT EXISTS (
               SELECT 1 FROM journey_collaborators c
               WHERE c.user_id = users.id AND c.role = 'supervisor'
             )
         )::int AS without_journey,
         count(*) FILTER (
           WHERE account_state <> 'deleted'
             AND EXISTS (SELECT 1 FROM driving_journeys j WHERE j.student_user_id = users.id)
         )::int AS students,
         count(*) FILTER (
           WHERE account_state <> 'deleted'
             AND EXISTS (
               SELECT 1 FROM journey_collaborators c
               WHERE c.user_id = users.id AND c.role = 'supervisor' AND c.status = 'active'
             )
         )::int AS supervisors
       FROM users`,
    ),
    pool.query(
      `SELECT COALESCE(s.event_source, 'unknown') AS key, count(*)::int AS count
       FROM driving_journeys j
       LEFT JOIN (
         SELECT DISTINCT ON (journey_id) journey_id, event_source
         FROM product_events
         WHERE event_name = 'journey_created' AND journey_id IS NOT NULL
         ORDER BY journey_id, created_at DESC
       ) s ON s.journey_id = j.id
       GROUP BY 1`,
    ),
    pool.query(
      `SELECT practice_stage::text AS key, count(*)::int AS count
       FROM driving_journeys
       GROUP BY 1`,
    ),
    pool.query(
      `SELECT transmission_scope::text AS key, count(*)::int AS count
       FROM driving_journeys
       GROUP BY 1`,
    ),
    pool.query(
      `SELECT
         CASE
           WHEN n >= 2 THEN '2+'
           ELSE n::text
         END AS key,
         count(*)::int AS count
       FROM (
         SELECT j.id, count(c.id) FILTER (WHERE c.status = 'active')::int AS n
         FROM driving_journeys j
         LEFT JOIN journey_collaborators c
           ON c.journey_id = j.id AND c.role = 'supervisor'
         GROUP BY j.id
       ) sized
       GROUP BY 1`,
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE d.started_by_user_id = j.student_user_id)::int AS student,
         count(*) FILTER (
           WHERE d.started_by_deleted
              OR (
                d.started_by_user_id IS NOT NULL
                AND d.started_by_user_id <> j.student_user_id
              )
         )::int AS supervisor
       FROM drives d
       JOIN driving_journeys j ON j.id = d.journey_id`,
    ),
    pool.query(
      `SELECT o.assessment::text AS key, count(*)::int AS count
       FROM drive_observations o
       WHERE NOT EXISTS (
         SELECT 1
         FROM drive_observations newer
         WHERE newer.supersedes_observation_id = o.id
           AND newer.journey_id = o.journey_id
       )
       GROUP BY 1`,
    ),
    pool.query(
      `SELECT sd.title, count(DISTINCT (dfs.drive_id, dfs.journey_id))::int AS drives
       FROM drive_focus_skills dfs
       JOIN skill_definitions sd
         ON sd.skill_id = dfs.skill_id AND sd.taxonomy_version = 1
       GROUP BY sd.title
       ORDER BY drives DESC, sd.title ASC`,
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE cardinality(environment) = 0)::int AS environment_missing,
         count(*) FILTER (WHERE 'residential' = ANY(environment))::int AS residential,
         count(*) FILTER (WHERE 'urban' = ANY(environment))::int AS urban,
         count(*) FILTER (WHERE 'rural' = ANY(environment))::int AS rural,
         count(*) FILTER (WHERE 'highway' = ANY(environment))::int AS highway,
         count(*) FILTER (WHERE light_condition IS NULL)::int AS light_missing,
         count(*) FILTER (WHERE light_condition = 'daylight')::int AS daylight,
         count(*) FILTER (WHERE light_condition = 'dusk_dawn')::int AS dusk_dawn,
         count(*) FILTER (WHERE light_condition = 'night')::int AS night,
         count(*) FILTER (WHERE weather_condition IS NULL)::int AS weather_missing,
         count(*) FILTER (WHERE weather_condition = 'dry')::int AS dry,
         count(*) FILTER (WHERE weather_condition = 'rain')::int AS rain,
         count(*) FILTER (WHERE weather_condition = 'snow_ice')::int AS snow_ice,
         count(*) FILTER (WHERE weather_condition = 'fog')::int AS fog,
         count(*) FILTER (WHERE traffic_level IS NULL)::int AS traffic_missing,
         count(*) FILTER (WHERE traffic_level = 'light')::int AS light,
         count(*) FILTER (WHERE traffic_level = 'moderate')::int AS moderate,
         count(*) FILTER (WHERE traffic_level = 'heavy')::int AS heavy
       FROM drives`,
    ),
    pool.query(
      `SELECT
         count(*) FILTER (
           WHERE event_name = 'onboarding_role_selected' AND actor_role = 'student'
         )::int AS onboarding_student,
         count(*) FILTER (
           WHERE event_name = 'onboarding_role_selected' AND actor_role = 'supervisor'
         )::int AS onboarding_supervisor,
         count(*) FILTER (WHERE event_name = 'student_handoff_started')::int AS student_handoff_started,
         count(*) FILTER (WHERE event_name = 'recap_viewed')::int AS recap_viewed,
         count(*) FILTER (WHERE event_name = 'next_drive_plan_created')::int AS next_drive_plan_created,
         count(*) FILTER (WHERE event_name = 'next_drive_plan_updated')::int AS next_drive_plan_updated,
         count(*) FILTER (WHERE event_name = 'training_guidance_opened')::int AS training_guidance_opened,
         count(*) FILTER (WHERE event_name = 'stale_drive_nudge_shown')::int AS stale_drive_nudge_shown
       FROM product_events`,
    ),
  ]);

  const studentIds = journeysResult.rows.map((row) => String(row.student_id));
  const waitlist = new Map<string, { id: string; status: string }>();
  if (studentIds.length > 0) {
    const matched = await pool.query(
      `WITH emails AS (
         SELECT u.id AS user_id, u.contact_email_normalized AS email
         FROM users u
         WHERE u.id = ANY($1::uuid[])
           AND u.account_state <> 'deleted'
           AND u.contact_email_normalized IS NOT NULL
         UNION
         SELECT a.user_id, a.email_normalized
         FROM auth_identities a
         JOIN users u ON u.id = a.user_id
         WHERE a.user_id = ANY($1::uuid[])
           AND u.account_state <> 'deleted'
           AND a.email_normalized IS NOT NULL
       )
       SELECT DISTINCT ON (e.user_id) e.user_id, s.id, s.status
       FROM emails e
       JOIN interest_signups s ON s.email_normalized = e.email
       ORDER BY e.user_id, s.created_at DESC, s.id DESC`,
      [studentIds],
    );
    for (const row of matched.rows) {
      waitlist.set(String(row.user_id), {
        id: String(row.id),
        status: String(row.status),
      });
    }
  }

  const journeys: UsageJourney[] = journeysResult.rows.map((row) => {
    const deleted = String(row.student_state) === "deleted";
    const ratedDrives = num(row.rated_drives);
    const drivesStarted = num(row.drives_started);
    const activeSupervisors = num(row.active_supervisors);
    const studentId = String(row.student_id);
    return {
      journeyId: String(row.id),
      student: {
        userId: studentId,
        name: personName(deleted, row.student_name, deleted ? "Tidigare elev" : "Elev"),
        removed: deleted,
      },
      supervisors: supervisorsFrom(row.supervisors),
      createdAt: new Date(String(row.created_at)).toISOString(),
      lastActivityAt: new Date(String(row.last_activity_at)).toISOString(),
      source: asSource(row.event_source),
      practiceStage: asStage(row.practice_stage),
      transmission: asTransmission(row.transmission),
      activeSupervisors,
      drivesStarted,
      drivesCompleted: num(row.drives_completed),
      ratedDrives,
      furthest: furthest(ratedDrives, drivesStarted, activeSupervisors),
      waitlist: deleted ? null : (waitlist.get(studentId) ?? null),
    };
  });

  const account = accounts.rows[0] ?? {};
  const starter = starters.rows[0] ?? {};
  const context = contextRow.rows[0] ?? {};
  const events = eventRows.rows[0] ?? {};
  const skills = skillRows.rows.map((row) => ({
    title: String(row.title),
    drives: num(row.drives),
  }));

  return {
    journeys,
    journeyTotal: num(journeysResult.rows[0]?.journey_total ?? 0),
    accountsWithoutJourney: num(account.without_journey),
    studentAccounts: num(account.students),
    supervisorAccounts: num(account.supervisors),
    bySource: fill(
      USAGE_SOURCES,
      sourceRows.rows.map((row) => ({ key: String(row.key), count: num(row.count) })),
    ),
    byPracticeStage: fill(
      USAGE_STAGES,
      stageRows.rows.map((row) => ({ key: String(row.key), count: num(row.count) })),
    ),
    byTransmission: fill(
      USAGE_TRANSMISSIONS,
      transmissionRows.rows.map((row) => ({ key: String(row.key), count: num(row.count) })),
    ),
    bySupervisorCount: fill(
      USAGE_SUPERVISOR_BUCKETS,
      supervisorRows.rows.map((row) => ({ key: String(row.key), count: num(row.count) })),
    ),
    drivesStartedByStudent: num(starter.student),
    drivesStartedBySupervisor: num(starter.supervisor),
    byAssessment: fill(
      USAGE_ASSESSMENTS,
      assessmentRows.rows.map((row) => ({ key: String(row.key), count: num(row.count) })),
    ),
    focusSkills: skills.slice(0, 8),
    otherFocusSkills: Math.max(0, skills.length - 8),
    byEnvironment: fill(USAGE_ENVIRONMENTS, [
      { key: "residential", count: num(context.residential) },
      { key: "urban", count: num(context.urban) },
      { key: "rural", count: num(context.rural) },
      { key: "highway", count: num(context.highway) },
    ]),
    environmentMissing: num(context.environment_missing),
    byLight: fill(USAGE_LIGHT, [
      { key: "daylight", count: num(context.daylight) },
      { key: "dusk_dawn", count: num(context.dusk_dawn) },
      { key: "night", count: num(context.night) },
    ]),
    lightMissing: num(context.light_missing),
    byWeather: fill(USAGE_WEATHER, [
      { key: "dry", count: num(context.dry) },
      { key: "rain", count: num(context.rain) },
      { key: "snow_ice", count: num(context.snow_ice) },
      { key: "fog", count: num(context.fog) },
    ]),
    weatherMissing: num(context.weather_missing),
    byTraffic: fill(USAGE_TRAFFIC, [
      { key: "light", count: num(context.light) },
      { key: "moderate", count: num(context.moderate) },
      { key: "heavy", count: num(context.heavy) },
    ]),
    trafficMissing: num(context.traffic_missing),
    events: USAGE_EVENT_NAMES.map((key) => ({ key, count: num(events[key]) })),
  };
}
