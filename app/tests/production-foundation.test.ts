import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertProductionConfig,
  config,
  productionDefaults,
} from "../src/config.js";
import { applyMigrations } from "../src/db/migrate.js";
import { getPool } from "../src/db/pool.js";
import { redactRequestPath } from "../src/http/log.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const FRESH_DB_URL =
  "postgresql://bilklar:bilklar@127.0.0.1:54330/korpasset_migrate_fresh";
const PRODLIKE_DB_URL =
  "postgresql://bilklar:bilklar@127.0.0.1:54330/korpasset_migrate_prodlike";
const INITIAL_MIGRATION_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations/0001_initial.sql"),
  "utf8",
);

describe("production foundation", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("GET /health returns ok when the database is reachable", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { status: string; checkedAt: string };
    assert.equal(body.status, "ok");
    assert.ok(body.checkedAt);
    assert.ok(response.headers["x-request-id"]);
    await app.close();
  });

  it("forwards an incoming x-request-id", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "beta-trace-1" },
    });
    assert.equal(response.headers["x-request-id"], "beta-trace-1");
    await app.close();
  });

  it("sets Secure on the session cookie when APP_BASE_URL is https", async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://korpasset.se";
    try {
      assert.equal(config.cookieSecure, true);
      const app = await createTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      });
      assert.equal(response.statusCode, 302);
      const cookie = response.cookies.find((item) => item.name === "bilklar_session");
      assert.ok(cookie);
      assert.equal(cookie.secure, true);
      assert.equal(cookie.httpOnly, true);
      await app.close();
    } finally {
      restoreEnvValue("APP_BASE_URL", previous);
    }
  });

  it("does not set Secure on the session cookie for local http", async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "http://localhost:3000";
    try {
      assert.equal(config.cookieSecure, false);
      const app = await createTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      });
      const cookie = response.cookies.find((item) => item.name === "bilklar_session");
      assert.ok(cookie);
      assert.notEqual(cookie.secure, true);
      await app.close();
    } finally {
      restoreEnvValue("APP_BASE_URL", previous);
    }
  });

  it("redacts invitation tokens in request paths", () => {
    assert.equal(
      redactRequestPath("/invite/abc.def_token?x=1"),
      "/invite/[redacted]?x=1",
    );
    assert.equal(redactRequestPath("/journey/123"), "/journey/123");
    assert.equal(
      redactRequestPath("/admin/reset-password?token=abc.def"),
      "/admin/reset-password?token=[redacted]",
    );
    assert.equal(redactRequestPath(undefined), "");
  });

  it("rejects production boot with missing or default secrets", () => {
    const snapshot = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      APP_BASE_URL: process.env.APP_BASE_URL,
      ALLOW_HTTP: process.env.ALLOW_HTTP,
    };

    try {
      process.env.NODE_ENV = "production";
      delete process.env.DATABASE_URL;
      delete process.env.SESSION_SECRET;
      delete process.env.APP_BASE_URL;
      delete process.env.ALLOW_HTTP;

      assert.throws(
        () => assertProductionConfig(),
        /DATABASE_URL, SESSION_SECRET, APP_BASE_URL/,
      );

      process.env.DATABASE_URL = "postgresql://example/korpasset";
      process.env.SESSION_SECRET = productionDefaults.DEV_SESSION_SECRET;
      process.env.APP_BASE_URL = "https://korpasset.se";
      assert.throws(() => assertProductionConfig(), /development default/);

      process.env.SESSION_SECRET = "short";
      assert.throws(() => assertProductionConfig(), /at least 32 characters/);

      process.env.SESSION_SECRET = "a".repeat(32);
      process.env.APP_BASE_URL = "http://korpasset.se";
      assert.throws(() => assertProductionConfig(), /must be https/);

      process.env.APP_BASE_URL = "https://korpasset.se";
      assert.doesNotThrow(() => assertProductionConfig());
    } finally {
      restoreEnv(snapshot);
    }
  });

  it("stamps an already-applied 0001 migration instead of re-running it", async () => {
    const first = await applyMigrations();
    assert.ok(
      first.stamped.includes("0001_initial.sql") ||
        first.skipped.includes("0001_initial.sql"),
    );

    const second = await applyMigrations();
    assert.deepEqual(second.applied, []);
    assert.ok(second.skipped.includes("0001_initial.sql"));

    const recorded = await getPool().query(
      `SELECT id FROM schema_migrations WHERE id = '0001_initial.sql'`,
    );
    assert.equal(recorded.rowCount, 1);
  });
});

describe("production foundation / fresh database migrate", () => {
  after(async () => {
    const admin = new pg.Client({
      connectionString: "postgresql://bilklar:bilklar@127.0.0.1:54330/postgres",
    });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS korpasset_migrate_fresh`);
    await admin.end();
  });

  it("applies 0001_initial.sql on an empty database and is idempotent", async () => {
    const admin = new pg.Client({
      connectionString: "postgresql://bilklar:bilklar@127.0.0.1:54330/postgres",
    });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS korpasset_migrate_fresh`);
    await admin.query(`CREATE DATABASE korpasset_migrate_fresh`);
    await admin.end();

    const client = new pg.Client({ connectionString: FRESH_DB_URL });
    await client.connect();
    const first = await applyMigrations(client);
    assert.deepEqual(first.applied, [
      "0001_initial.sql",
      "0002_interest_signups.sql",
      "0003_admin_auth.sql",
      "0004_resend_webhook_events.sql",
      "0005_admin_audit_events.sql",
      "0006_interest_signups_platform.sql",
      "0007_product_events.sql",
      "0008_observation_completed_steps.sql",
    ]);
    assert.deepEqual(first.stamped, []);

    const tables = await client.query(
      `SELECT to_regclass('public.users') AS users,
              to_regclass('public.interest_signups') AS interest,
              to_regclass('public.admin_users') AS admins,
              to_regclass('public.resend_webhook_events') AS webhooks,
              to_regclass('public.admin_audit_events') AS audit,
              to_regclass('public.product_events') AS events`,
    );
    assert.ok(tables.rows[0].users);
    assert.ok(tables.rows[0].interest);
    assert.ok(tables.rows[0].admins);
    assert.ok(tables.rows[0].webhooks);
    assert.ok(tables.rows[0].audit);
    assert.ok(tables.rows[0].events);

    const second = await applyMigrations(client);
    assert.deepEqual(second.applied, []);
    assert.ok(second.skipped.includes("0001_initial.sql"));
    await client.end();
  });
});

describe("production foundation / existing 0001 without schema_migrations", () => {
  after(async () => {
    const admin = new pg.Client({
      connectionString: "postgresql://bilklar:bilklar@127.0.0.1:54330/postgres",
    });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS korpasset_migrate_prodlike`);
    await admin.end();
  });

  it("stamps 0001 and applies 0002-0005 on a bootstrap-style database", async () => {
    const admin = new pg.Client({
      connectionString: "postgresql://bilklar:bilklar@127.0.0.1:54330/postgres",
    });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS korpasset_migrate_prodlike`);
    await admin.query(`CREATE DATABASE korpasset_migrate_prodlike`);
    await admin.end();

    const client = new pg.Client({ connectionString: PRODLIKE_DB_URL });
    await client.connect();
    await client.query(INITIAL_MIGRATION_SQL);

    const before = await client.query(
      `SELECT to_regclass('public.schema_migrations') AS migrations,
              to_regclass('public.users') AS users,
              to_regclass('public.interest_signups') AS interest,
              to_regclass('public.admin_users') AS admins,
              to_regclass('public.resend_webhook_events') AS webhooks`,
    );
    assert.equal(before.rows[0].migrations, null);
    assert.ok(before.rows[0].users);
    assert.equal(before.rows[0].interest, null);
    assert.equal(before.rows[0].admins, null);
    assert.equal(before.rows[0].webhooks, null);

    const first = await applyMigrations(client);
    assert.deepEqual(first.stamped, ["0001_initial.sql"]);
    assert.deepEqual(first.applied, [
      "0002_interest_signups.sql",
      "0003_admin_auth.sql",
      "0004_resend_webhook_events.sql",
      "0005_admin_audit_events.sql",
      "0006_interest_signups_platform.sql",
      "0007_product_events.sql",
      "0008_observation_completed_steps.sql",
    ]);
    assert.deepEqual(first.skipped, []);

    const after = await client.query(
      `SELECT to_regclass('public.schema_migrations') AS migrations,
              to_regclass('public.interest_signups') AS interest,
              to_regclass('public.admin_users') AS admins,
              to_regclass('public.resend_webhook_events') AS webhooks,
              to_regclass('public.admin_audit_events') AS audit`,
    );
    assert.ok(after.rows[0].migrations);
    assert.ok(after.rows[0].interest);
    assert.ok(after.rows[0].admins);
    assert.ok(after.rows[0].webhooks);
    assert.ok(after.rows[0].audit);

    const ids = await client.query(`SELECT id FROM schema_migrations ORDER BY id`);
    assert.deepEqual(
      ids.rows.map((row) => row.id),
      [
        "0001_initial.sql",
        "0002_interest_signups.sql",
        "0003_admin_auth.sql",
        "0004_resend_webhook_events.sql",
        "0005_admin_audit_events.sql",
        "0006_interest_signups_platform.sql",
        "0007_product_events.sql",
        "0008_observation_completed_steps.sql",
      ],
    );

    const second = await applyMigrations(client);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.stamped, []);
    assert.ok(second.skipped.includes("0001_initial.sql"));
    assert.ok(second.skipped.includes("0004_resend_webhook_events.sql"));
    await client.end();
  });
});

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    restoreEnvValue(key, value);
  }
}
