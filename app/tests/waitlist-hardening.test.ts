import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { csvCell } from "../src/http/csv.js";
import { INTEREST_RATE_LIMIT, allowRequest } from "../src/http/rate-limit.js";
import { createAdminToken } from "../src/auth/admin.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { saveInterestSignup, updateInterestSignup } from "../src/services/interest.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("waitlist hardening", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("prefixes formula-like CSV cells", () => {
    assert.equal(csvCell("safe"), "safe");
    assert.equal(
      csvCell('=HYPERLINK("http://evil.example","x")'),
      `"'=HYPERLINK(""http://evil.example"",""x"")"`,
    );
    assert.equal(csvCell("+cmd"), "'+cmd");
    assert.equal(csvCell("-1+1"), "'-1+1");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell('Staden, "citat"'), `"Staden, ""citat"""`);
  });

  it("exports formula-safe CSV from admin", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    await saveInterestSignup({
      name: '=HYPERLINK("http://evil.example","x")',
      email: "formula@example.com",
      role: "other",
      city: 'Staden, "citat"',
      message: "rad1\nrad2",
      platformAndroid: true,
    });
    const app = await createTestApp();
    const csv = await app.inject({
      method: "GET",
      url: "/admin/signups.csv",
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /'=HYPERLINK/);
    assert.doesNotMatch(csv.body, /^created_at,=HYPERLINK/m);
    assert.doesNotMatch(csv.body, /admin_note/);
    await app.close();
  });

  it("rate-limits POST /interest per IP", async () => {
    const app = await createTestApp();
    let lastStatus = 0;
    for (let i = 0; i < INTEREST_RATE_LIMIT.limit + 1; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/interest",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({
          name: "Anna",
          email: `anna${i}@example.com`,
          role: "parent",
          platform_ios: "yes",
          consent: "yes",
        }),
      });
      lastStatus = response.statusCode;
    }
    assert.equal(lastStatus, 429);
    const count = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(count.rows[0].n, INTEREST_RATE_LIMIT.limit);
    await app.close();
  });

  it("does not overwrite PII after the signup is no longer new", async () => {
    const first = await saveInterestSignup({
      name: "Anna",
      email: "anna@example.com",
      role: "parent",
      city: "Uppsala",
      message: "första",
      platformIos: true,
    });
    assert.ok(first);
    await updateInterestSignup(first.signup.id, { status: "contacted", adminNote: "behåll" });

    const app = await createTestApp();
    const second = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        name: "Inkräktare",
        email: "anna@example.com",
        role: "student",
        platform_android: "yes",
        city: "Lund",
        message: "överskriv",
        consent: "yes",
      }),
    });
    assert.equal(second.statusCode, 302);
    assert.equal(second.headers.location, "/interest/tack");
    const row = await getPool().query(
      `SELECT name, role, city, message, status, admin_note FROM interest_signups`,
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].name, "Anna");
    assert.equal(row.rows[0].city, "Uppsala");
    assert.equal(row.rows[0].message, "första");
    assert.equal(row.rows[0].status, "contacted");
    assert.equal(row.rows[0].admin_note, "behåll");
    await app.close();
  });

  it("deletes a waitlist row only via confirmed POST", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const saved = await saveInterestSignup({
      name: "Anna",
      email: "anna@example.com",
      role: "parent",
      platformIos: true,
    });
    assert.ok(saved);
    const app = await createTestApp();
    const token = createAdminToken(admin.id);
    const list = await app.inject({
      method: "GET",
      url: "/admin/signups",
      cookies: { korpasset_admin: token },
    });
    assert.equal(list.statusCode, 200);
    assert.match(list.body, /Ta bort/);
    assert.match(list.body, new RegExp(`/admin/signups/${saved.signup.id}/delete`));

    const missingConfirm = await app.inject({
      method: "POST",
      url: `/admin/signups/${saved.signup.id}/delete`,
      cookies: { korpasset_admin: token },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({}),
    });
    assert.equal(missingConfirm.statusCode, 400);

    const getDelete = await app.inject({
      method: "GET",
      url: `/admin/signups/${saved.signup.id}/delete`,
      cookies: { korpasset_admin: token },
    });
    assert.notEqual(getDelete.statusCode, 302);

    const deleted = await app.inject({
      method: "POST",
      url: `/admin/signups/${saved.signup.id}/delete`,
      cookies: { korpasset_admin: token },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ confirm: "yes" }),
    });
    assert.equal(deleted.statusCode, 302);
    const count = await getPool().query(`SELECT count(*)::int AS n FROM interest_signups`);
    assert.equal(count.rows[0].n, 0);
    await app.close();
  });

  it("keeps allowRequest within the configured window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 8; i += 1) {
      assert.equal(allowRequest("unit", 8, 60_000, now + i), true);
    }
    assert.equal(allowRequest("unit", 8, 60_000, now + 9), false);
    assert.equal(allowRequest("unit", 8, 60_000, now + 60_001), true);
  });
});
