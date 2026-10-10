/**
 * Local-only Postgres for campaign screenshots.
 * Uses embedded-postgres (same approach as app/tests/setup.ts).
 * Does not touch production.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "../../../../app/node_modules/embedded-postgres/dist/index.js";
import pg from "../../../../app/node_modules/pg/esm/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");
const databaseDir = join(repoRoot, "app/.pgdata-campaign");
const port = 54329;
const user = "bilklar";
const password = "bilklar";
const database = "bilklar_test";

mkdirSync(databaseDir, { recursive: true });

const embedded = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
});

async function waitFor(connectionString: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`PostgreSQL did not become ready: ${connectionString}`);
}

const adminUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/postgres`;

await embedded.initialise();
await embedded.start();
await waitFor(adminUrl);

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
  database,
]);
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE ${database}`);
}
await admin.end();

console.log(
  `campaign-db-ready postgresql://${user}:${password}@127.0.0.1:${port}/${database}`,
);

const shutdown = async () => {
  await embedded.stop();
  process.exit(0);
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

await new Promise(() => undefined);
