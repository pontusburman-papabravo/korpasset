import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeEach, describe, it } from "node:test";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const execFileAsync = promisify(execFile);
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/vps-backup.sh",
);

function stampDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return iso;
}

async function prune(dir: string): Promise<string> {
  const result = await execFileAsync("bash", [SCRIPT, "--prune-only"], {
    env: { ...process.env, KORPASSET_BACKUP_DIR: dir },
  });
  return `${result.stdout}${result.stderr}`;
}

async function adoptLegacy(dir: string, legacyDirs: string[]): Promise<string> {
  const result = await execFileAsync("bash", [SCRIPT, "--adopt-legacy"], {
    env: {
      ...process.env,
      KORPASSET_BACKUP_DIR: dir,
      KORPASSET_LEGACY_BACKUP_DIRS: legacyDirs.join(":"),
    },
  });
  return `${result.stdout}${result.stderr}`;
}

async function touchDaysAgo(path: string, days: number): Promise<void> {
  await execFileAsync("touch", ["-d", `${days} days ago`, path]);
}

describe("backup 14-day retention", () => {
  it("deletes dumps that are 14 days old or older and keeps younger ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korpasset-backups-"));
    try {
      const expired = `korpasset-${stampDaysAgo(14)}.dump`;
      const older = `korpasset-${stampDaysAgo(20)}.dump`;
      const kept = `korpasset-${stampDaysAgo(13)}.dump`;
      const fresh = `korpasset-${stampDaysAgo(0)}.dump`;
      for (const name of [expired, older, kept, fresh]) {
        await writeFile(join(dir, name), "fake-dump");
      }
      await writeFile(join(dir, "readme.txt"), "ignore");

      const output = await prune(dir);
      assert.match(output, /deleted=2/);
      assert.match(output, /kept=2/);
      assert.match(output, /retention_days=14/);

      const remaining = new Set(await readdir(dir));
      assert.equal(remaining.has(expired), false);
      assert.equal(remaining.has(older), false);
      assert.equal(remaining.has(kept), true);
      assert.equal(remaining.has(fresh), true);
      assert.equal(remaining.has("readme.txt"), true);

      const second = await prune(dir);
      assert.match(second, /deleted=0/);
      assert.match(second, /kept=2/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prunes expired dumps on install even when today's dump already exists", async () => {
    const dest = await mkdtemp(join(tmpdir(), "korpasset-backups-dest-"));
    const legacy = await mkdtemp(join(tmpdir(), "korpasset-backups-legacy-"));
    try {
      const today = `korpasset-${stampDaysAgo(0)}.dump`;
      const expired = `korpasset-${stampDaysAgo(14)}.dump`;
      const oddOld = "korpasset-legacy-pre-canonical.dump";
      const oddYoung = "korpasset-manual.dump";
      await writeFile(join(dest, today), "today");
      await writeFile(join(legacy, expired), "expired-canonical");
      await writeFile(join(dest, oddOld), "expired-odd");
      await writeFile(join(dest, oddYoung), "young-odd");
      await touchDaysAgo(join(dest, oddOld), 20);
      await touchDaysAgo(join(dest, oddYoung), 2);

      const output = await adoptLegacy(dest, [legacy]);
      assert.match(output, /moved=1/);
      assert.match(output, /deleted=2/);
      assert.match(output, /kept=2/);

      const remaining = new Set(await readdir(dest));
      assert.equal(remaining.has(today), true);
      assert.equal(remaining.has(oddYoung), true);
      assert.equal(remaining.has(expired), false);
      assert.equal(remaining.has(oddOld), false);
      assert.deepEqual(await readdir(legacy), []);
    } finally {
      await rm(dest, { recursive: true, force: true });
      await rm(legacy, { recursive: true, force: true });
    }
  });
});

describe("backup retention legal copy", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("states the 14-day restore-only backup routine", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    assert.match(privacy.body, /högst 14 dagar/);
    assert.match(privacy.body, /14 dagar gamla eller äldre/);
    assert.match(privacy.body, /bara för att återställa tjänsten/);
    assert.doesNotMatch(privacy.body, /ännu inte fastställt/);
    await app.close();
  });
});
