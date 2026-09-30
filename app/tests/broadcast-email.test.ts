import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import {
  BROADCAST_FROM,
  listBroadcastRecipients,
  sendBroadcast,
} from "../src/services/broadcast-email.js";
import { resendMessage, singleRecipient, type OutboundEmail } from "../src/services/email.js";
import { saveInterestSignup } from "../src/services/interest.js";
import { createGuestUser } from "../src/services/users.js";
import { resetDatabaseData } from "./setup.js";

describe("broadcast email", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("puts exactly one recipient on a message from info@", () => {
    const message = resendMessage({
      to: "  anna@example.com ",
      from: BROADCAST_FROM,
      subject: "Hej",
      text: "Ett brev.",
    });
    assert.equal(message.from, "Körpasset <info@korpasset.se>");
    assert.deepEqual(message.to, ["anna@example.com"]);
    assert.throws(() => singleRecipient("anna@example.com, bo@example.com"), /en mottagare/);
    assert.throws(() => singleRecipient("anna@example.com bo@example.com"), /en mottagare/);
  });

  it("sends one message per person and skips declined and deleted", async () => {
    await saveInterestSignup({
      name: "Anna",
      email: "Anna@example.com",
      role: "parent",
      platformIos: true,
    });
    const declined = await saveInterestSignup({
      name: "Bo",
      email: "bo@example.com",
      role: "student",
      platformAndroid: true,
    });
    assert.ok(declined);
    await getPool().query(`UPDATE interest_signups SET status = 'declined' WHERE id = $1`, [
      declined.signup.id,
    ]);

    const ella = await createGuestUser("Ella");
    await getPool().query(
      `UPDATE users
       SET contact_email = 'ella@example.com', contact_email_normalized = 'ella@example.com'
       WHERE id = $1`,
      [ella.id],
    );
    await getPool().query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, verified_at, email, email_normalized)
       VALUES ($1, 'google', 'ella-subject', now(), 'ella@example.com', 'ella@example.com')`,
      [ella.id],
    );

    const gone = await createGuestUser("Borta");
    await getPool().query(
      `UPDATE users
       SET account_state = 'deleted',
           contact_email = 'gone@example.com',
           contact_email_normalized = 'gone@example.com'
       WHERE id = $1`,
      [gone.id],
    );

    const recipients = await listBroadcastRecipients();
    assert.deepEqual(recipients, ["anna@example.com", "ella@example.com"]);

    const sent: OutboundEmail[] = [];
    const result = await sendBroadcast({
      recipients: [...recipients, "anna@example.com", "ella@example.com, bo@example.com"],
      subject: "Till dig",
      text: "Bara du står som mottagare.",
      send: async (email) => {
        if (email.to.includes(",")) throw new Error("lista");
        sent.push(email);
      },
    });

    assert.equal(result.sent, 2);
    assert.deepEqual(
      result.failed,
      ["ella@example.com, bo@example.com"],
    );
    assert.equal(sent.length, 2);
    for (const email of sent) {
      assert.equal(email.from, BROADCAST_FROM);
      assert.equal(email.to.includes(","), false);
      assert.equal(email.to.includes(" "), false);
    }
    assert.deepEqual(
      sent.map((email) => email.to),
      ["anna@example.com", "ella@example.com"],
    );
  });
});
