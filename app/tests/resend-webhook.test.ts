import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { verifyResendWebhook } from "../src/http/resend-webhook-verify.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const TEST_SECRET = `whsec_${Buffer.from("korpasset-test-webhook-secret").toString("base64")}`;

function signPayload(secret: string, payload: string, id: string, timestamp: string) {
  const key = Buffer.from(secret.replace("whsec_", ""), "base64");
  const signed = `${id}.${timestamp}.${payload}`;
  const sig = createHmac("sha256", key).update(signed).digest("base64");
  return { id, timestamp, signature: `v1,${sig}` };
}

describe("verifyResendWebhook", () => {
  it("accepts a valid signature", () => {
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const { id, timestamp, signature } = signPayload(TEST_SECRET, payload, "msg_test", ts);
    const event = verifyResendWebhook(
      payload,
      {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      TEST_SECRET,
    );
    assert.equal(event?.type, "email.delivered");
    assert.equal(event?.data?.email_id, "abc");
  });

  it("rejects an invalid signature", () => {
    const event = verifyResendWebhook(
      "{}",
      {
        "svix-id": "x",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalid",
      },
      TEST_SECRET,
    );
    assert.equal(event, null);
  });
});

describe("POST /api/resend/webhook", () => {
  const previousSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(async () => {
    await resetDatabaseData();
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previousSecret;
  });

  it("stores a signed delivered event and ignores a replay", async () => {
    const app = await createTestApp();
    const payload = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c", to: ["ops@korpasset.se"] },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signPayload(TEST_SECRET, payload, "msg_e2e_1", ts);

    const first = await app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": signed.id,
        "svix-timestamp": signed.timestamp,
        "svix-signature": signed.signature,
      },
      payload,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().received, true);

    const replay = await app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": signed.id,
        "svix-timestamp": signed.timestamp,
        "svix-signature": signed.signature,
      },
      payload,
    });
    assert.equal(replay.statusCode, 200);

    const rows = await getPool().query(
      `SELECT event_type, email_id, svix_id FROM resend_webhook_events`,
    );
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].event_type, "email.delivered");
    assert.equal(rows.rows[0].email_id, "4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    assert.equal(rows.rows[0].svix_id, "msg_e2e_1");
    await app.close();
  });

  it("rejects a bad signature without writing a row", async () => {
    const app = await createTestApp();
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": "msg_bad",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,AAAA",
      },
      payload,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Invalid signature");
    const rows = await getPool().query(`SELECT count(*)::int AS n FROM resend_webhook_events`);
    assert.equal(rows.rows[0].n, 0);
    await app.close();
  });

  it("returns 503 when the signing secret is missing", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const app = await createTestApp();
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: { "content-type": "application/json" },
      payload,
    });
    assert.equal(response.statusCode, 503);
    const rows = await getPool().query(`SELECT count(*)::int AS n FROM resend_webhook_events`);
    assert.equal(rows.rows[0].n, 0);
    await app.close();
  });

  it("acknowledges bounce without echoing the recipient", async () => {
    const app = await createTestApp();
    const payload = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "bounce-id", to: ["ops@korpasset.se"] },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signPayload(TEST_SECRET, payload, "msg_bounce", ts);
    const response = await app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: {
        "content-type": "application/json",
        "svix-id": signed.id,
        "svix-timestamp": signed.timestamp,
        "svix-signature": signed.signature,
      },
      payload,
    });
    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(response.body, /ops@korpasset\.se/);
    const rows = await getPool().query(
      `SELECT event_type FROM resend_webhook_events WHERE email_id = 'bounce-id'`,
    );
    assert.equal(rows.rows[0].event_type, "email.bounced");
    await app.close();
  });

  it("stamps the first delivery and open on the product mail row", async () => {
    const student = await createJourneyForStudent("Nora");
    await getPool().query(
      `INSERT INTO account_help_emails (account_id, type, provider_message_id)
       VALUES ($1, 'no_journey', 'help-id')`,
      [student.userId],
    );
    await getPool().query(
      `INSERT INTO journey_weekly_emails (
         journey_id, account_id, week_key, template, status, provider_message_id, sent_at
       ) VALUES ($1, $2, '2026-W40', 'weekly_summary', 'sent', 'weekly-id', now())`,
      [student.journey.id, student.userId],
    );
    const app = await createTestApp();
    const firstAt = new Date(Date.now() - 60_000).toISOString();
    const delivered = await postEvent(app, {
      type: "email.delivered",
      created_at: firstAt,
      data: { email_id: "weekly-id", to: ["nora@example.com"] },
    }, "msg_delivered");
    assert.equal(delivered.statusCode, 200);
    assert.doesNotMatch(delivered.body, /nora@example.com/);

    const later = new Date().toISOString();
    const replayed = await postEvent(app, {
      type: "email.delivered",
      created_at: later,
      data: { email_id: "weekly-id" },
    }, "msg_delivered_again");
    assert.equal(replayed.statusCode, 200);

    const opened = await postEvent(app, {
      type: "email.opened",
      created_at: later,
      data: { email_id: "help-id", to: ["nora@example.com"] },
    }, "msg_opened");
    assert.equal(opened.statusCode, 200);
    assert.doesNotMatch(opened.body, /nora@example.com/);

    const bounced = await postEvent(app, {
      type: "email.bounced",
      created_at: later,
      data: { email_id: "help-id" },
    }, "msg_help_bounce");
    assert.equal(bounced.statusCode, 200);

    const weekly = await getPool().query<{ delivered_at: Date; opened_at: Date | null }>(
      `SELECT delivered_at, opened_at FROM journey_weekly_emails WHERE provider_message_id = 'weekly-id'`,
    );
    assert.equal(weekly.rows[0].delivered_at.toISOString(), new Date(firstAt).toISOString());
    assert.equal(weekly.rows[0].opened_at, null);

    const help = await getPool().query<{
      delivered_at: Date | null;
      opened_at: Date;
      bounced_at: Date;
    }>(
      `SELECT delivered_at, opened_at, bounced_at FROM account_help_emails WHERE provider_message_id = 'help-id'`,
    );
    assert.equal(help.rows[0].delivered_at, null);
    assert.equal(help.rows[0].opened_at.toISOString(), new Date(later).toISOString());
    assert.ok(help.rows[0].bounced_at);
    await app.close();
  });
});

async function postEvent(
  app: Awaited<ReturnType<typeof createTestApp>>,
  event: { type: string; created_at: string; data: { email_id: string; to?: string[] } },
  svixId: string,
) {
  const payload = JSON.stringify(event);
  const ts = String(Math.floor(Date.now() / 1000));
  const signed = signPayload(TEST_SECRET, payload, svixId, ts);
  return app.inject({
    method: "POST",
    url: "/api/resend/webhook",
    headers: {
      "content-type": "application/json",
      "svix-id": signed.id,
      "svix-timestamp": signed.timestamp,
      "svix-signature": signed.signature,
    },
    payload,
  });
}
