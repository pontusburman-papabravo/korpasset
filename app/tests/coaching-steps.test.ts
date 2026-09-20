import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { coachingStepsForSkillKey } from "../src/domain/coaching-steps.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("coaching steps", () => {
  it("covers every taxonomy skill with three to five steps", () => {
    const taxonomy = JSON.parse(
      readFileSync(
        join(__dirname, "../../docs/domain/skill-taxonomy-v1.json"),
        "utf8",
      ),
    ) as { areas: { skills: { skillKey: string }[] }[] };
    const keys = taxonomy.areas.flatMap((area) =>
      area.skills.map((skill) => skill.skillKey),
    );
    assert.equal(keys.length, 38);
    for (const key of keys) {
      const steps = coachingStepsForSkillKey(key);
      assert.ok(steps.length >= 3, `${key} needs at least 3 steps`);
      assert.ok(steps.length <= 5, `${key} should stay at most 5 steps`);
      const stepKeys = steps.map((step) => step.key);
      assert.equal(new Set(stepKeys).size, stepKeys.length, `${key} duplicate step keys`);
    }
  });
});
