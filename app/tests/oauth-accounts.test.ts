import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createGuestUser, getUserById } from "../src/services/users.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { resetDatabaseData } from "./setup.js";

describe("continueWithOAuth (FR-11, FR-10)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("creates an active user and identity on first Apple continue", async () => {
    const result = await continueWithOAuth({
      provider: "apple",
      subject: "apple-sub-1",
      displayName: "Ella",
    });
    assert.equal(result.created, true);
    assert.equal(result.claimedGuest, false);

    const user = await getUserById(result.userId);
    assert.equal(user?.accountState, "active");
    assert.equal(user?.displayName, "Ella");

    const identities = await getPool().query(
      `SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1`,
      [result.userId],
    );
    assert.equal(identities.rowCount, 1);
    assert.equal(identities.rows[0].provider, "apple");
    assert.equal(identities.rows[0].provider_subject, "apple-sub-1");
  });

  it("logs the same subject back into the same user", async () => {
    const first = await continueWithOAuth({
      provider: "google",
      subject: "google-sub-1",
      displayName: "Ella",
    });
    const second = await continueWithOAuth({
      provider: "google",
      subject: "google-sub-1",
      displayName: "Another Name",
    });
    assert.equal(second.userId, first.userId);
    assert.equal(second.created, false);
    const user = await getUserById(first.userId);
    assert.equal(user?.displayName, "Ella");
  });

  it("does not treat email as an identity key across Apple and Google", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-sub-a",
      displayName: "Ada",
    });
    const google = await continueWithOAuth({
      provider: "google",
      subject: "google-sub-b",
      displayName: "Bertil",
    });
    assert.notEqual(apple.userId, google.userId);
  });

  it("claims a guest session onto the same user_id without merge", async () => {
    const guest = await createGuestUser("Pappa");
    const result = await continueWithOAuth({
      provider: "apple",
      subject: "apple-sub-guest",
      displayName: "Pappa Apple",
      sessionUserId: guest.id,
    });
    assert.equal(result.userId, guest.id);
    assert.equal(result.claimedGuest, true);
    assert.equal(result.created, false);

    const user = await getUserById(guest.id);
    assert.equal(user?.accountState, "active");
    assert.equal(user?.displayName, "Pappa");
  });

  it("links unused Google onto an existing Apple user when that user is signed in", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-sub-link",
      displayName: "Ella",
    });
    const linked = await continueWithOAuth({
      provider: "google",
      subject: "google-sub-link",
      sessionUserId: apple.userId,
    });
    assert.equal(linked.userId, apple.userId);
    const identities = await getPool().query(
      `SELECT provider FROM auth_identities WHERE user_id = $1 ORDER BY provider`,
      [apple.userId],
    );
    assert.deepEqual(
      identities.rows.map((row) => row.provider),
      ["apple", "google"],
    );
  });

  it("rejects claiming an identity that already belongs to another user", async () => {
    const owner = await continueWithOAuth({
      provider: "apple",
      subject: "apple-taken",
      displayName: "Ägare",
    });
    const guest = await createGuestUser("Inkräktare");
    await assert.rejects(
      () =>
        continueWithOAuth({
          provider: "apple",
          subject: "apple-taken",
          sessionUserId: guest.id,
        }),
      (error: Error & { code?: string; statusCode?: number }) =>
        error.code === "identity_on_other_user" && error.statusCode === 409,
    );
    assert.ok(owner.userId);
  });

  it("does not reuse a deleted actor session", async () => {
    const guest = await createGuestUser("Gammal");
    await getPool().query(
      `UPDATE users SET account_state = 'deleted' WHERE id = $1`,
      [guest.id],
    );
    const result = await continueWithOAuth({
      provider: "google",
      subject: "google-after-delete",
      displayName: "Ny",
      sessionUserId: guest.id,
    });
    assert.notEqual(result.userId, guest.id);
    assert.equal(result.created, true);
  });

  it("does not log a suspended account back in", async () => {
    const first = await continueWithOAuth({
      provider: "apple",
      subject: "apple-suspended",
      displayName: "Ella",
    });
    await getPool().query(
      `UPDATE users SET account_state = 'suspended' WHERE id = $1`,
      [first.userId],
    );
    await assert.rejects(
      () =>
        continueWithOAuth({
          provider: "apple",
          subject: "apple-suspended",
        }),
      (error: Error & { code?: string; statusCode?: number }) =>
        error.code === "account_unavailable" && error.statusCode === 403,
    );
  });

  it("keeps a student journey when a supervisor later claims Apple", async () => {
    const student = await createJourneyForStudent("Ella");
    const guest = await createGuestUser("Pappa");
    await getPool().query(
      `INSERT INTO journey_collaborators (journey_id, user_id, role, status)
       VALUES ($1, $2, 'supervisor', 'active')`,
      [student.journey.id, guest.id],
    );
    const claimed = await continueWithOAuth({
      provider: "apple",
      subject: "apple-supervisor",
      sessionUserId: guest.id,
    });
    assert.equal(claimed.userId, guest.id);
    const collab = await getPool().query(
      `SELECT user_id, status FROM journey_collaborators WHERE journey_id = $1`,
      [student.journey.id],
    );
    assert.equal(collab.rows[0].user_id, guest.id);
    assert.equal(collab.rows[0].status, "active");
  });
});
