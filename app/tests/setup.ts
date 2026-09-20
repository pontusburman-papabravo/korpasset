import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { seedTaxonomy } from "../src/db/seed-taxonomy.js";
import { applyMigrations } from "../src/db/migrate.js";
import { closePool, getPool } from "../src/db/pool.js";
import { resetRateLimitsForTests } from "../src/http/rate-limit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATABASE_URL =
  "postgresql://bilklar:bilklar@127.0.0.1:54330/bilklar_test";
const PGDATA_DIR = join(__dirname, "../.pgdata-test");

let embedded: EmbeddedPostgres | null = null;
let databaseReady = false;

async function waitForPostgres(connectionString: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("PostgreSQL did not become ready in time");
}

export async function setupTestDatabase(): Promise<void> {
  if (databaseReady) return;

  await closePool();
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  rmSync(PGDATA_DIR, { recursive: true, force: true });

  embedded = new EmbeddedPostgres({
    databaseDir: PGDATA_DIR,
    user: "bilklar",
    password: "bilklar",
    port: 54330,
    persistent: false,
  });

  await embedded.initialise();
  await embedded.start();

  const adminClient = new pg.Client({
    connectionString: "postgresql://bilklar:bilklar@127.0.0.1:54330/postgres",
  });
  await waitForPostgres("postgresql://bilklar:bilklar@127.0.0.1:54330/postgres");
  await adminClient.connect();
  const dbExists = await adminClient.query(
    `SELECT 1 FROM pg_database WHERE datname = 'bilklar_test'`,
  );
  if (dbExists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE bilklar_test`);
  }
  await adminClient.end();

  await waitForPostgres(TEST_DATABASE_URL);
  await applyMigrations(getPool());
  await seedTaxonomy(getPool());
  databaseReady = true;
}

export async function teardownTestDatabase(): Promise<void> {
  await closePool();
  if (embedded) {
    await embedded.stop();
    embedded = null;
  }
  databaseReady = false;
}

export async function resetDatabaseData(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    TRUNCATE
      product_events,
      resend_webhook_events,
      admin_audit_events,
      admin_password_reset_tokens,
      admin_users,
      interest_signups,
      drive_observations,
      drive_focus_skills,
      training_focus_items,
      drives,
      journey_invitations,
      journey_collaborators,
      driving_journeys,
      skill_definitions,
      skills,
      auth_identities,
      users
    RESTART IDENTITY CASCADE
  `);
  await seedTaxonomy(pool);
  resetRateLimitsForTests();
}
