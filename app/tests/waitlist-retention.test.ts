import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { deleteProductAccount } from "../src/services/account-lifecycle.js";
import {
  WAITLIST_RETENTION_MONTHS,
  purgeExpiredWaitlistSignups,
} from "../src/services/waitlist-retention.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

async function insertSignup(input: {
  name: string;
  email: string;
  status?: string;
  age: string;
}): Promise<string> {
  const result = await getPool().query(
    `INSERT INTO interest_signups (
       name, email, email_normalized, role, status,
       platform_ios, platform_android, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, 'parent', $4, true, false,
       now() - $5::interval, now() - $5::interval
     )
     RETURNING id`,
    [input.name, input.email, input.email.toLowerCase(), input.status ?? "new", input.age],
  );
  return String(result.rows[0].id);
}

describe("waitlist 18-month retention", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("deletes signups at or beyond 18 months and keeps younger rows", async () => {
    const expiredNew = await insertSignup({
      name: "Gammal ny",
      email: "old-new@example.com",
      status: "new",
      age: "18 months",
    });
    const expiredInvited = await insertSignup({
      name: "Gammal inbjuden",
      email: "old-invited@example.com",
      status: "invited",
      age: "19 months",
    });
    const expiredDeclined = await insertSignup({
      name: "Gammal avböjd",
      email: "old-declined@example.com",
      status: "declined",
      age: "18 months 1 day",
    });
    const fresh = await insertSignup({
      name: "Ny",
      email: "fresh@example.com",
      age: "1 day",
    });
    const almost = await insertSignup({
      name: "Nästan",
      email: "almost@example.com",
      status: "contacted",
      age: "17 months 27 days",
    });

    const first = await purgeExpiredWaitlistSignups();
    assert.equal(first.skipped, false);
    assert.equal(first.deletedCount, 3);
    assert.equal(WAITLIST_RETENTION_MONTHS, 18);

    const remaining = await getPool().query(
      `SELECT id, email_normalized FROM interest_signups ORDER BY email_normalized`,
    );
    assert.deepEqual(
      remaining.rows.map((row) => row.email_normalized),
      ["almost@example.com", "fresh@example.com"],
    );
    assert.ok(remaining.rows.every((row) => row.id !== expiredNew));
    assert.ok(remaining.rows.every((row) => row.id !== expiredInvited));
    assert.ok(remaining.rows.every((row) => row.id !== expiredDeclined));
    assert.ok(remaining.rows.some((row) => row.id === fresh));
    assert.ok(remaining.rows.some((row) => row.id === almost));

    const second = await purgeExpiredWaitlistSignups();
    assert.equal(second.deletedCount, 0);
  });

  it("does not delete product users or journeys when purging the waitlist", async () => {
    const student = await createJourneyForStudent("Ella");
    await insertSignup({
      name: "Ella waitlist",
      email: "ella-waitlist@example.com",
      age: "20 months",
    });
    await insertSignup({
      name: "Kvar",
      email: "keep@example.com",
      age: "2 months",
    });

    const summary = await purgeExpiredWaitlistSignups();
    assert.equal(summary.deletedCount, 1);

    const user = await getPool().query(
      `SELECT id, account_state, display_name FROM users WHERE id = $1`,
      [student.userId],
    );
    assert.equal(user.rowCount, 1);
    assert.equal(user.rows[0].account_state, "guest");
    assert.equal(user.rows[0].display_name, "Ella");

    const journey = await getPool().query(
      `SELECT id, status FROM driving_journeys WHERE id = $1`,
      [student.journey.id],
    );
    assert.equal(journey.rowCount, 1);
    assert.equal(journey.rows[0].status, "active");

    const waitlist = await getPool().query(
      `SELECT email_normalized FROM interest_signups`,
    );
    assert.deepEqual(
      waitlist.rows.map((row) => row.email_normalized),
      ["keep@example.com"],
    );
  });

  it("leaves waitlist rows in place when a product account is deleted", async () => {
    const student = await createJourneyForStudent("Ella");
    await insertSignup({
      name: "Ella waitlist",
      email: "ella-waitlist@example.com",
      age: "20 months",
    });

    await deleteProductAccount(student.userId);

    const waitlist = await getPool().query(
      `SELECT email_normalized FROM interest_signups`,
    );
    assert.equal(waitlist.rows[0].email_normalized, "ella-waitlist@example.com");

    const purged = await purgeExpiredWaitlistSignups();
    assert.equal(purged.deletedCount, 1);
    const after = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(after.rows[0].n, 0);
  });
});

describe("waitlist retention legal copy", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("describes automatic 18-month waitlist deletion without changing account-deletion isolation", async () => {
    const app = await createTestApp();
    const privacy = await app.inject({ method: "GET", url: "/integritet" });
    const deletion = await app.inject({ method: "GET", url: "/radera-konto" });

    assert.match(privacy.body, /automatiskt jobb/);
    assert.match(privacy.body, /18 månader gamla eller äldre/);
    assert.doesNotMatch(privacy.body, /inget automatiskt retention-jobb/);
    assert.doesNotMatch(privacy.body, /sker denna radering manuellt/);
    assert.match(privacy.body, /intresseanmälan till betan raderas inte automatiskt/i);
    assert.match(deletion.body, /raderas automatiskt senast 18 månader/);
    await app.close();
  });
});
