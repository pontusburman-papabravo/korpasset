/**
 * Demo journey for campaign screenshots.
 * Creates data only through app services, then backdates drive timestamps
 * so the real history views show several days — not five passes at the same minute.
 * Local database only.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionToken } from "../../../../app/src/auth/session.js";
import { applyMigrations } from "../../../../app/src/db/migrate.js";
import { getPool, closePool } from "../../../../app/src/db/pool.js";
import { seedTaxonomy } from "../../../../app/src/db/seed-taxonomy.js";
import { createDriveWithFocus, endDrive } from "../../../../app/src/services/drives.js";
import { acceptInvitation, createInvitation } from "../../../../app/src/services/invitations.js";
import {
  createJourneyForStudent,
  updatePracticeStage,
  updateTransmissionScope,
} from "../../../../app/src/services/journeys.js";
import { saveNextDrivePlan } from "../../../../app/src/services/next-drive-plan.js";
import {
  saveDriveObservations,
  type AssessmentLevel,
} from "../../../../app/src/services/observations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../demo-session.json");

type SkillRating = {
  key: string;
  assessment: AssessmentLevel;
  completedStepKeys?: string[];
};

type DrivePlan = {
  daysAgo: number;
  supervisor: "erik" | "sara";
  skills: SkillRating[];
};

const DRIVES: DrivePlan[] = [
  {
    daysAgo: 20,
    supervisor: "erik",
    skills: [
      {
        key: "car_control_pre_drive_check",
        assessment: "independent",
        completedStepKeys: ["outside", "seat_belt", "mirrors", "controls"],
      },
      {
        key: "car_control_smooth_start_stop",
        assessment: "with_support",
        completedStepKeys: ["ready", "stop"],
      },
      {
        key: "car_control_braking",
        assessment: "independent",
        completedStepKeys: ["scan", "ease", "firm"],
      },
    ],
  },
  {
    daysAgo: 15,
    supervisor: "sara",
    skills: [
      {
        key: "car_control_gear_shifting",
        assessment: "with_support",
        completedStepKeys: ["choose", "road"],
      },
      {
        key: "car_control_speed_adaptation",
        assessment: "needs_help",
        completedStepKeys: ["sign"],
      },
      {
        key: "observation_mirror_routine",
        assessment: "with_support",
        completedStepKeys: ["before_slow"],
      },
    ],
  },
  {
    daysAgo: 10,
    supervisor: "erik",
    skills: [
      {
        key: "observation_mirror_routine",
        assessment: "independent",
        completedStepKeys: ["before_slow", "before_turn", "behind"],
      },
      {
        key: "observation_blind_spot",
        assessment: "with_support",
        completedStepKeys: ["mirrors_first", "shoulder"],
      },
      {
        key: "positioning_road_position",
        assessment: "independent",
        completedStepKeys: ["lane", "edge", "others"],
      },
    ],
  },
  {
    daysAgo: 6,
    supervisor: "sara",
    skills: [
      {
        key: "intersections_right_hand_rule",
        assessment: "with_support",
        completedStepKeys: ["spot", "slow"],
      },
      {
        key: "intersections_give_way",
        assessment: "independent",
        completedStepKeys: ["sign", "stop", "gap"],
      },
      {
        key: "positioning_turning",
        assessment: "with_support",
        completedStepKeys: ["speed", "place", "mirror_signal"],
      },
    ],
  },
  {
    daysAgo: 2,
    supervisor: "erik",
    skills: [
      {
        key: "roundabout_entry",
        assessment: "with_support",
        completedStepKeys: ["slow", "yield"],
      },
      {
        key: "roundabout_positioning",
        assessment: "needs_help",
        completedStepKeys: ["choose"],
      },
      {
        key: "roundabout_exit",
        assessment: "with_support",
        completedStepKeys: ["signal", "leave"],
      },
    ],
  },
];

const NEXT_PLAN_KEYS = [
  "roundabout_positioning",
  "observation_scanning",
  "intersections_right_hand_rule",
];

async function skillIds(keys: string[]): Promise<Map<string, string>> {
  const result = await getPool().query(
    `SELECT id, skill_key FROM skills WHERE skill_key = ANY($1::text[])`,
    [keys],
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    map.set(String(row.skill_key), String(row.id));
  }
  const missing = keys.filter((key) => !map.has(key));
  if (missing.length > 0) {
    throw new Error(`Missing skills: ${missing.join(", ")}`);
  }
  return map;
}

const pool = getPool();
await applyMigrations(pool);
await seedTaxonomy(pool);

const student = await createJourneyForStudent("Alex", null, "building", "direct");
await updatePracticeStage(student.journey.id, student.userId, "building");
await updateTransmissionScope(student.journey.id, student.userId, "manual");

const erikInvite = await createInvitation(student.journey.id, student.userId);
const erik = await acceptInvitation(erikInvite.token, "Erik", null);
const saraInvite = await createInvitation(student.journey.id, student.userId);
const sara = await acceptInvitation(saraInvite.token, "Sara", null);
const supervisors = { erik: erik.userId, sara: sara.userId };

const allKeys = [
  ...new Set([...DRIVES.flatMap((drive) => drive.skills.map((skill) => skill.key)), ...NEXT_PLAN_KEYS]),
];
const ids = await skillIds(allKeys);

const createdDrives: Array<{
  id: string;
  daysAgo: number;
  supervisorName: string;
  skillKeys: string[];
}> = [];

for (const plan of DRIVES) {
  const supervisorId = supervisors[plan.supervisor];
  const focusIds = plan.skills.map((skill) => ids.get(skill.key)!);
  const created = await createDriveWithFocus(
    student.journey.id,
    student.userId,
    focusIds,
    supervisorId,
  );
  await endDrive(student.journey.id, created.drive.id, supervisorId);
  await saveDriveObservations(
    student.journey.id,
    created.drive.id,
    supervisorId,
    plan.skills.map((skill) => ({
      skillId: ids.get(skill.key)!,
      assessment: skill.assessment,
      completedStepKeys: skill.completedStepKeys,
    })),
  );

  const endedAt = new Date(Date.now() - plan.daysAgo * 24 * 60 * 60 * 1000);
  endedAt.setHours(18, 10, 0, 0);
  const startedAt = new Date(endedAt.getTime() - 45 * 60 * 1000);
  await pool.query(
    `UPDATE drives SET started_at = $2, ended_at = $3 WHERE id = $1`,
    [created.drive.id, startedAt.toISOString(), endedAt.toISOString()],
  );
  await pool.query(`UPDATE drive_observations SET observed_at = $2 WHERE drive_id = $1`, [
    created.drive.id,
    endedAt.toISOString(),
  ]);

  createdDrives.push({
    id: created.drive.id,
    daysAgo: plan.daysAgo,
    supervisorName: plan.supervisor === "erik" ? "Erik" : "Sara",
    skillKeys: plan.skills.map((skill) => skill.key),
  });
}

const plan = await saveNextDrivePlan(
  student.journey.id,
  student.userId,
  NEXT_PLAN_KEYS.map((key) => ids.get(key)!),
);

const latest = createdDrives.reduce((a, b) => (a.daysAgo < b.daysAgo ? a : b));

const manifest = {
  studentName: "Alex",
  supervisors: ["Erik", "Sara"],
  studentUserId: student.userId,
  erikUserId: erik.userId,
  saraUserId: sara.userId,
  journeyId: student.journey.id,
  sessionCookie: createSessionToken(student.userId),
  erikSessionCookie: createSessionToken(erik.userId),
  routes: {
    next: `/journey/${student.journey.id}/nasta`,
    development: `/journey/${student.journey.id}/utveckling`,
    recap: `/journey/${student.journey.id}/drive/${latest.id}/done`,
    home: `/journey/${student.journey.id}`,
  },
  latestDriveId: latest.id,
  planSkills: plan.plan.skills.map((skill) => skill.title),
  drives: createdDrives,
};

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outPath, routes: manifest.routes, planSkills: manifest.planSkills }, null, 2));
await closePool();
