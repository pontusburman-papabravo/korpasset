import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import {
  createDriveWithFocus,
  endDrive,
  isDriveFocusFullyObserved,
} from "../src/services/drives.js";
import {
  addLiveObservation,
  completeMissingDriveObservations,
  getDriveObservationRecap,
  getLatestDriveObservationsBySkill,
  getMissingDriveFocusSkillIds,
  saveDriveObservations,
} from "../src/services/observations.js";
import { recommendNextFocus } from "../src/services/recommendations.js";
import { AppError, ForbiddenError } from "../src/errors.js";
import { resetDatabaseData } from "./setup.js";

async function setupJourneyWithSupervisors(
  studentName: string,
  supervisorNames: string[],
) {
  const { journey, userId: studentId } = await createJourneyForStudent(studentName);
  const supervisors: { name: string; userId: string }[] = [];

  for (const name of supervisorNames) {
    const invitation = await createInvitation(journey.id, studentId);
    const accepted = await acceptInvitation(invitation.token, name, null);
    supervisors.push({ name, userId: accepted.userId });
  }

  return { journey, studentId, supervisors };
}

async function skillIds(count: number): Promise<string[]> {
  const result = await getPool().query(
    `SELECT id FROM skills ORDER BY skill_key LIMIT $1`,
    [count],
  );
  return result.rows.map((row) => row.id);
}

describe("live observations", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  describe("addLiveObservation", () => {
    it("allows assigned supervisor to observe during active drive", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
        skillId: ids[0],
        assessment: "needs_help",
      });

      const count = await getPool().query(
        `SELECT count(*)::int AS count FROM drive_observations WHERE drive_id = $1`,
        [drive.id],
      );
      assert.equal(count.rows[0].count, 1);
    });

    it("stores completed coaching steps with the live observation", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const skill = await getPool().query(
        `SELECT id, skill_key FROM skills WHERE skill_key = 'positioning_lane_change'`,
      );
      const skillId = String(skill.rows[0].id);
      const { drive } = await createDriveWithFocus(journey.id, studentId, [skillId]);

      await addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
        skillId,
        assessment: "with_support",
        completedStepKeys: ["mirror", "signal"],
      });

      const latest = await getLatestDriveObservationsBySkill(journey.id, drive.id);
      assert.deepEqual(latest[0].completedStepKeys, ["mirror", "signal"]);
    });

    it("rejects unknown coaching step keys", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(1);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
            skillId: ids[0],
            assessment: "needs_help",
            completedStepKeys: ["not-a-real-step"],
          }),
        (error: Error) =>
          error instanceof AppError && error.message.includes("övningssteg"),
      );
    });

    it("rejects observation after drive ended", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      await endDrive(journey.id, drive.id, studentId);

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
            skillId: ids[0],
            assessment: "needs_help",
          }),
        (error: Error) => error.message.includes("ended drive"),
      );
    });

    it("rejects wrong supervisor", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik", "Karin"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(
        journey.id,
        studentId,
        ids,
        supervisors[0].userId,
      );

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[1].userId, {
            skillId: ids[0],
            assessment: "needs_help",
          }),
        (error: Error) =>
          error instanceof ForbiddenError &&
          error.message.includes("Wrong supervisor"),
      );
    });

    it("rejects student observer", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, studentId, {
            skillId: ids[0],
            assessment: "needs_help",
          }),
        (error: Error) => error instanceof ForbiddenError,
      );
    });

    it("rejects skill outside drive focus", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(3);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids.slice(0, 2));

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
            skillId: ids[2],
            assessment: "needs_help",
          }),
        (error: Error) => error.message.includes("drive focus"),
      );
    });

    it("rejects invalid assessment", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
            skillId: ids[0],
            assessment: "invalid" as "needs_help",
          }),
        (error: Error) => error.message.includes("Invalid assessment"),
      );
    });

    it("allows multiple observations for same skill during active drive", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
        skillId: ids[0],
        assessment: "with_support",
      });

      const rows = await getPool().query(
        `SELECT assessment, supersedes_observation_id
         FROM drive_observations
         WHERE drive_id = $1 AND skill_id = $2
         ORDER BY observed_at ASC`,
        [drive.id, ids[0]],
      );
      assert.equal(rows.rowCount, 2);
      assert.equal(rows.rows[0].assessment, "needs_help");
      assert.equal(rows.rows[1].assessment, "with_support");
      assert.equal(rows.rows[0].supersedes_observation_id, null);
      assert.equal(rows.rows[1].supersedes_observation_id, null);
    });
  });

  describe("isDriveFocusFullyObserved", () => {
    it("tracks completeness for three focus skills", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(3);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), false);

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), false);

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[1],
        assessment: "with_support",
      });
      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), false);

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[2],
        assessment: "independent",
      });
      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), true);
    });

    it("stays incomplete when only one skill has multiple observations", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(3);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "with_support",
      });

      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), false);
    });
  });

  describe("end flow", () => {
    it("keeps batch rating when there are no live observations", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      await endDrive(journey.id, drive.id, studentId);

      await saveDriveObservations(journey.id, drive.id, supervisors[0].userId, [
        { skillId: ids[0], assessment: "needs_help" },
        { skillId: ids[1], assessment: "with_support" },
      ]);

      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), true);
    });

    it("completes only missing skills after partial live observations", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(3);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[1],
        assessment: "with_support",
      });
      await endDrive(journey.id, drive.id, studentId);

      assert.deepEqual(
        await getMissingDriveFocusSkillIds(journey.id, drive.id),
        [ids[2]],
      );

      await completeMissingDriveObservations(journey.id, drive.id, supervisorId, [
        { skillId: ids[2], assessment: "independent" },
      ]);

      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), true);
      const count = await getPool().query(
        `SELECT count(*)::int AS count FROM drive_observations WHERE drive_id = $1`,
        [drive.id],
      );
      assert.equal(count.rows[0].count, 3);
    });

    it("skips rating when all focus skills were observed live", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      for (const skillId of ids) {
        await addLiveObservation(journey.id, drive.id, supervisorId, {
          skillId,
          assessment: "with_support",
        });
      }
      await endDrive(journey.id, drive.id, studentId);

      assert.equal(await isDriveFocusFullyObserved(journey.id, drive.id), true);
      assert.deepEqual(await getMissingDriveFocusSkillIds(journey.id, drive.id), []);
    });
  });

  describe("recap", () => {
    it("shows only latest observation per skill", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "with_support",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[1],
        assessment: "independent",
      });

      const recap = await getDriveObservationRecap(journey.id, drive.id);
      assert.equal(recap.length, 2);
      const firstSkillRecap = recap.find((item) => item.skillId === ids[0]);
      assert.equal(firstSkillRecap?.assessment, "with_support");

      const count = await getPool().query(
        `SELECT count(*)::int AS count
         FROM drive_observations
         WHERE drive_id = $1 AND skill_id = $2`,
        [drive.id, ids[0]],
      );
      assert.equal(count.rows[0].count, 2);
    });

    it("excludes superseded observations from recap", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      await endDrive(journey.id, drive.id, studentId);
      await saveDriveObservations(journey.id, drive.id, supervisors[0].userId, [
        { skillId: ids[0], assessment: "needs_help" },
        { skillId: ids[1], assessment: "with_support" },
      ]);

      const original = await getPool().query(
        `SELECT id FROM drive_observations
         WHERE drive_id = $1 AND skill_id = $2
         ORDER BY observed_at ASC LIMIT 1`,
        [drive.id, ids[0]],
      );

      await getPool().query(
        `INSERT INTO drive_observations (
           journey_id, drive_id, skill_id, observer_user_id,
           source_type, assessment, supersedes_observation_id
         )
         SELECT journey_id, drive_id, skill_id, observer_user_id,
                source_type, 'independent', id
         FROM drive_observations WHERE id = $1`,
        [original.rows[0].id],
      );

      const recap = await getDriveObservationRecap(journey.id, drive.id);
      const firstSkillRecap = recap.find((item) => item.skillId === ids[0]);
      assert.equal(firstSkillRecap?.assessment, "independent");
    });
  });

  describe("recommendation compatibility", () => {
    it("uses latest non-superseded observation journey-wide", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "with_support",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[1],
        assessment: "independent",
      });
      await endDrive(journey.id, drive.id, studentId);

      const latest = await getLatestDriveObservationsBySkill(journey.id, drive.id);
      assert.equal(
        latest.find((item) => item.skillId === ids[0])?.assessment,
        "with_support",
      );

      const recommendations = await recommendNextFocus(journey.id);
      assert.ok(
        !recommendations.some(
          (rec) => rec.skillId === ids[0] && rec.reason === "needs_help",
        ),
      );
    });
  });

  describe("completeMissingDriveObservations guards", () => {
    it("rejects completion payload for already observed skills", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await endDrive(journey.id, drive.id, studentId);

      await assert.rejects(
        () =>
          completeMissingDriveObservations(journey.id, drive.id, supervisorId, [
            { skillId: ids[0], assessment: "with_support" },
            { skillId: ids[1], assessment: "independent" },
          ]),
        (error: Error) => error.message.includes("not missing from drive focus"),
      );
    });

    it("rejects duplicate batch rating when live observations already exist", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
      });
      await endDrive(journey.id, drive.id, studentId);

      await assert.rejects(
        () =>
          saveDriveObservations(journey.id, drive.id, supervisorId, [
            { skillId: ids[0], assessment: "needs_help" },
            { skillId: ids[1], assessment: "with_support" },
          ]),
        (error: Error) =>
          error instanceof AppError && error.code === "already_rated",
      );
    });
  });

  describe("live notes", () => {
    it("stores a trimmed note on the latest observation", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
        skillId: ids[0],
        assessment: "needs_help",
        note: "  Stannade för sent  ",
      });

      const recap = await getDriveObservationRecap(journey.id, drive.id);
      assert.equal(recap.length, 1);
      assert.equal(recap[0].note, "Stannade för sent");
    });

    it("rejects notes longer than 280 characters", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);

      await assert.rejects(
        () =>
          addLiveObservation(journey.id, drive.id, supervisors[0].userId, {
            skillId: ids[0],
            assessment: "needs_help",
            note: "x".repeat(281),
          }),
        (error: Error) =>
          error instanceof AppError && error.code === "invalid_note",
      );
    });

    it("keeps later notes when the same skill is observed again", async () => {
      const { journey, studentId, supervisors } = await setupJourneyWithSupervisors(
        "Anna",
        ["Erik"],
      );
      const ids = await skillIds(2);
      const { drive } = await createDriveWithFocus(journey.id, studentId, ids);
      const supervisorId = supervisors[0].userId;

      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "needs_help",
        note: "Första anteckningen",
      });
      await addLiveObservation(journey.id, drive.id, supervisorId, {
        skillId: ids[0],
        assessment: "with_support",
        note: "Bättre andra varvet",
      });

      const latest = await getLatestDriveObservationsBySkill(journey.id, drive.id);
      const first = latest.find((item) => item.skillId === ids[0]);
      assert.equal(first?.assessment, "with_support");
      assert.equal(first?.note, "Bättre andra varvet");
    });
  });
});
