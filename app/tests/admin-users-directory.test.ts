import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminToken } from "../src/auth/admin.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("admin user directory", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("lists, searches, edits, exports and deletes product users beyond the waitlist", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const nora = await createGuestUser("Nora");
    const omar = await continueWithOAuth({
      provider: "google",
      subject: "google-omar",
      displayName: "Omar",
      email: "omar@example.com",
    });
    await saveInterestSignup({
      name: "Bara beta",
      email: "beta@example.com",
      role: "parent",
      platformIos: true,
    });

    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };

    const list = await app.inject({ method: "GET", url: "/admin/users", cookies });
    assert.equal(list.statusCode, 200);
    assert.match(list.body, /Nora/);
    assert.match(list.body, /Omar/);
    assert.match(list.body, /omar@example.com/);
    assert.doesNotMatch(list.body, /beta@example.com/);
    assert.doesNotMatch(list.body, /Bara beta/);

    const byName = await app.inject({
      method: "GET",
      url: "/admin/users?q=nora",
      cookies,
    });
    assert.match(byName.body, /Nora/);
    assert.doesNotMatch(byName.body, /Omar/);

    const byEmail = await app.inject({
      method: "GET",
      url: "/admin/users?q=omar@example.com",
      cookies,
    });
    assert.match(byEmail.body, /Omar/);
    assert.doesNotMatch(byEmail.body, /Nora/);

    const waitlistOnly = await app.inject({
      method: "GET",
      url: "/admin/users?q=beta@example.com",
      cookies,
    });
    assert.match(waitlistOnly.body, /Inga användare matchar/);

    const detail = await app.inject({
      method: "GET",
      url: `/admin/users/${omar.userId}`,
      cookies,
    });
    assert.equal(detail.statusCode, 200);
    assert.match(detail.body, /omar@example.com/);
    assert.match(detail.body, /google-omar/);
    assert.match(detail.body, /name="display_name"/);
    assert.match(detail.body, /name="contact_email"/);
    assert.match(detail.body, /Radera konto/);

    const invalid = await app.inject({
      method: "POST",
      url: `/admin/users/${nora.id}`,
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        display_name: "Nora",
        contact_email: "inte-en-adress",
        account_state: "guest",
      }),
    });
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.body, /giltig e-postadress/);

    const saved = await app.inject({
      method: "POST",
      url: `/admin/users/${nora.id}`,
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        display_name: "Nora Lind",
        contact_email: "nora@example.com",
        account_state: "suspended",
      }),
    });
    assert.equal(saved.statusCode, 302);
    assert.equal(saved.headers.location, `/admin/users/${nora.id}?saved=1`);

    const user = await getPool().query(
      `SELECT display_name, contact_email, account_state FROM users WHERE id = $1`,
      [nora.id],
    );
    assert.equal(user.rows[0].display_name, "Nora Lind");
    assert.equal(user.rows[0].contact_email, "nora@example.com");
    assert.equal(user.rows[0].account_state, "suspended");

    const audit = await getPool().query(
      `SELECT operation, summary FROM admin_audit_events ORDER BY created_at DESC LIMIT 1`,
    );
    assert.equal(audit.rows[0].operation, "user_update");
    assert.match(audit.rows[0].summary, /account_state guest → suspended/);
    assert.doesNotMatch(audit.rows[0].summary, /nora@example.com/);

    const csv = await app.inject({ method: "GET", url: "/admin/users.csv", cookies });
    assert.equal(csv.statusCode, 200);
    assert.match(String(csv.headers["content-type"]), /text\/csv/);
    assert.match(csv.body, /nora@example.com/);
    assert.match(csv.body, /omar@example.com/);
    assert.doesNotMatch(csv.body, /beta@example.com/);

    const suspendedOnly = await app.inject({
      method: "GET",
      url: "/admin/users.csv?state=suspended",
      cookies,
    });
    assert.match(suspendedOnly.body, /nora@example.com/);
    assert.doesNotMatch(suspendedOnly.body, /omar@example.com/);

    const deleted = await app.inject({
      method: "POST",
      url: `/admin/users/${nora.id}/delete-account`,
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        confirm_irreversible: "yes",
        confirm_user_id: nora.id,
      }),
    });
    assert.equal(deleted.statusCode, 302);
    assert.equal(deleted.headers.location, "/admin/users?deleted=1");

    const tombstone = await getPool().query(
      `SELECT display_name, contact_email, account_state FROM users WHERE id = $1`,
      [nora.id],
    );
    assert.equal(tombstone.rows[0].account_state, "deleted");
    assert.equal(tombstone.rows[0].display_name, null);
    assert.equal(tombstone.rows[0].contact_email, null);

    const blocked = await app.inject({
      method: "POST",
      url: `/admin/users/${nora.id}`,
      cookies,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({
        display_name: "Tillbaka",
        contact_email: "nora@example.com",
        account_state: "active",
      }),
    });
    assert.equal(blocked.statusCode, 409);

    const after = await app.inject({
      method: "GET",
      url: "/admin/users?state=deleted",
      cookies,
    });
    assert.match(after.body, /Tidigare användare/);
    assert.doesNotMatch(after.body, /nora@example.com/);
    await app.close();
  });

  it("paginates the directory at 50 rows and exports the full filter", async () => {
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    await getPool().query(
      `INSERT INTO users (display_name, account_state, contact_email, contact_email_normalized)
       SELECT 'Person ' || lpad(i::text, 2, '0'),
              'active',
              'person' || i || '@example.com',
              'person' || i || '@example.com'
       FROM generate_series(1, 51) AS i`,
    );
    const app = await createTestApp();
    const cookies = { korpasset_admin: createAdminToken(admin.id) };
    const page1 = await app.inject({ method: "GET", url: "/admin/users", cookies });
    assert.match(page1.body, /1–50 av 51/);
    assert.match(page1.body, /Nästa/);
    const page2 = await app.inject({ method: "GET", url: "/admin/users?page=2", cookies });
    assert.match(page2.body, /51–51 av 51/);
    const csv = await app.inject({ method: "GET", url: "/admin/users.csv", cookies });
    assert.equal(csv.body.split("\n").length, 52);
    await app.close();
  });
});
