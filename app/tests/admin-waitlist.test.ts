import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const ADMIN_EMAIL = "ops@korpasset.se";
const ADMIN_PASSWORD = "korrekt-losen-12";

async function seedAdmin() {
  return createAdminUser(ADMIN_EMAIL, ADMIN_PASSWORD);
}

describe("waitlist admin", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("hides admin when no admin users exist", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/admin" });
    assert.equal(response.statusCode, 404);
    assert.match(response.body, /Sidan finns inte/);
    await app.close();
  });

  it("lists signups and can update status", async () => {
    const admin = await seedAdmin();
    await saveInterestSignup({
      name: "Björn",
      email: "bjorn@example.com",
      role: "student",
      city: "Umeå",
      message: "Kört två månader",
      platformIos: true,
    });
    const app = await createTestApp();
    const token = createAdminToken(admin.id);
    const list = await app.inject({
      method: "GET",
      url: "/admin/signups",
      cookies: { korpasset_admin: token },
    });
    assert.equal(list.statusCode, 200);
    assert.match(list.body, /Björn/);
    assert.match(list.body, /bjorn@example.com/);
    assert.match(list.body, /1 nya/);
    assert.match(list.body, /Logga ut/);
    assert.doesNotMatch(list.body, /Bli betatestare/);

    const idMatch = list.body.match(/\/admin\/signups\/([0-9a-f-]{36})/);
    assert.ok(idMatch);
    const id = idMatch[1];

    const saved = await app.inject({
      method: "POST",
      url: `/admin/signups/${id}`,
      cookies: { korpasset_admin: token },
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        status: "contacted",
        admin_note: "Mejlade 17 sep",
      }),
    });
    assert.equal(saved.statusCode, 302);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/signups/${id}`,
      cookies: { korpasset_admin: token },
    });
    assert.match(detail.body, /Kontaktad/);
    assert.match(detail.body, /Mejlade 17 sep/);

    const csv = await app.inject({
      method: "GET",
      url: "/admin/signups.csv",
      cookies: { korpasset_admin: token },
    });
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /bjorn@example.com/);
    assert.match(csv.body, /contacted/);
    await app.close();
  });
});
