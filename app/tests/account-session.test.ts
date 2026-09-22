import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { getJourneyAccess } from "../src/services/authorization.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createGuestUser, getReusableSessionUserId } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("account state is a central product-session rule", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("rejects deleted and suspended actors from reusable sessions", async () => {
    const guest = await createGuestUser("Ella");
    assert.equal(await getReusableSessionUserId(guest.id), guest.id);

    await getPool().query(
      `UPDATE users SET account_state = 'suspended' WHERE id = $1`,
      [guest.id],
    );
    assert.equal(await getReusableSessionUserId(guest.id), null);

    await getPool().query(
      `UPDATE users SET account_state = 'deleted' WHERE id = $1`,
      [guest.id],
    );
    assert.equal(await getReusableSessionUserId(guest.id), null);
  });

  it("does not treat a suspended cookie as a signed-in product user", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    await getPool().query(
      `UPDATE users SET account_state = 'suspended' WHERE id = $1`,
      [userId],
    );

    assert.equal(await getJourneyAccess(journey.id, userId), null);

    const app = await createTestApp();
    const home = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(userId) },
      { method: "GET", url: "/" },
    );
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Bli betatestare/);

    const account = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(userId) },
      { method: "GET", url: "/konto" },
    );
    assert.equal(account.statusCode, 401);
    await app.close();
  });

  it("does not treat a deleted cookie as a signed-in product user", async () => {
    const { userId } = await createJourneyForStudent("Ella");
    await getPool().query(
      `UPDATE users SET account_state = 'deleted', display_name = NULL WHERE id = $1`,
      [userId],
    );

    const app = await createTestApp();
    const account = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(userId) },
      { method: "GET", url: "/konto" },
    );
    assert.equal(account.statusCode, 401);
    const cleared = account.cookies.find((cookie) => cookie.name === "bilklar_session");
    assert.ok(cleared);
    assert.equal(cleared.value, "");
    await app.close();
  });

  it("keeps an active Apple user's display name when they accept an invite", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-named",
      displayName: "Pappa Apple",
    });

    const accepted = await acceptInvitation(
      invitation.token,
      "Något annat namn",
      apple.userId,
    );
    assert.equal(accepted.userId, apple.userId);

    const user = await getPool().query(
      `SELECT display_name, account_state FROM users WHERE id = $1`,
      [apple.userId],
    );
    assert.equal(user.rows[0].account_state, "active");
    assert.equal(user.rows[0].display_name, "Pappa Apple");
  });

  it("still sets the guest name when a guest session accepts an invite", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const guest = await createGuestUser("Tillfällig");
    await acceptInvitation(invitation.token, "Pappa", guest.id);
    const user = await getPool().query(
      `SELECT display_name, account_state FROM users WHERE id = $1`,
      [guest.id],
    );
    assert.equal(user.rows[0].account_state, "guest");
    assert.equal(user.rows[0].display_name, "Pappa");
  });
});
