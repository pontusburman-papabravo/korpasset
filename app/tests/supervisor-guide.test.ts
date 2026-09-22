import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  SUPERVISOR_ROLE_CHAPTERS,
  supervisorGuideForSkillKey,
  supervisorGuideSkillKeys,
} from "../src/domain/supervisor-guide.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function taxonomySkillKeys(): string[] {
  const taxonomy = JSON.parse(
    readFileSync(
      join(__dirname, "../../docs/domain/skill-taxonomy-v1.json"),
      "utf8",
    ),
  ) as { areas: { skills: { skillKey: string }[] }[] };
  return taxonomy.areas.flatMap((area) =>
    area.skills.map((skill) => skill.skillKey),
  );
}

describe("supervisor guide", () => {
  it("covers every taxonomy skill with coaching copy", () => {
    const keys = taxonomySkillKeys();
    assert.equal(keys.length, 38);
    assert.deepEqual(supervisorGuideSkillKeys().sort(), [...keys].sort());

    for (const key of keys) {
      const guide = supervisorGuideForSkillKey(key);
      assert.ok(guide, `${key} missing guide`);
      assert.ok(guide.lookFor.length >= 2, `${key} needs lookFor`);
      assert.ok(guide.lookFor.length <= 3, `${key} too many lookFor`);
      assert.ok(guide.coachTips.length >= 2, `${key} needs coachTips`);
      assert.ok(guide.coachTips.length <= 3, `${key} too many coachTips`);
      assert.match(guide.discuss, /\?$/, `${key} discuss should be a question`);
      assert.ok(guide.tryWhen.length > 8, `${key} needs tryWhen`);
    }
  });

  it("stays a training aid, not a theory book or official result", () => {
    const blob = [
      ...SUPERVISOR_ROLE_CHAPTERS.flatMap((chapter) => chapter.points),
      ...supervisorGuideSkillKeys().flatMap((key) => {
        const guide = supervisorGuideForSkillKey(key);
        return [
          ...(guide?.lookFor ?? []),
          ...(guide?.coachTips ?? []),
          guide?.discuss ?? "",
          guide?.tryWhen ?? "",
        ];
      }),
    ].join("\n");

    assert.doesNotMatch(blob, /Handledarboken|Körkortsboken|STR Service/i);
    assert.doesNotMatch(blob, /87\s*%|uppkörningsklar|Godkänd|100\s*% körklar/i);
    assert.doesNotMatch(blob, /vad betyder skylten|kunskapsprov/i);
    assert.equal(SUPERVISOR_ROLE_CHAPTERS.length, 3);
    assert.deepEqual(
      SUPERVISOR_ROLE_CHAPTERS.map((chapter) => chapter.key),
      ["before", "during", "after"],
    );
  });
});
