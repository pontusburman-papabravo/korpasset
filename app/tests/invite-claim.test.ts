import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { getUserById } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

async function supervisorCount(journeyId: string, userId: string): Promise<number> {
  const result = await getPool().query(
    `SELECT count(*)::int AS n FROM journey_collaborators
     WHERE journey_id = $1 AND user_id = $2 AND role = 'supervisor' AND status = 'active'`,
    [journeyId, userId],
  );
  return result.rows[0].n;
}

describe("invite, guest and claim (FR-3, FR-10)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("reuses an active Apple/Google user on accept and does not overwrite display_name", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-invite-active",
      displayName: "Pappa Apple",
    });
    const accepted = await acceptInvitation(
      invitation.token,
      "Något annat namn",
      apple.userId,
    );
    assert.equal(accepted.userId, apple.userId);
    assert.equal(await supervisorCount(student.journey.id, apple.userId), 1);
    const user = await getUserById(apple.userId);
    assert.equal(user?.accountState, "active");
    assert.equal(user?.displayName, "Pappa Apple");
  });

  it("creates a guest actor when the supervisor is not signed in", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const accepted = await acceptInvitation(invitation.token, "Pappa", null);
    assert.notEqual(accepted.userId, student.userId);
    const user = await getUserById(accepted.userId);
    assert.equal(user?.accountState, "guest");
    assert.equal(user?.displayName, "Pappa");
    assert.equal(await supervisorCount(student.journey.id, accepted.userId), 1);
  });

  it("keeps the same user_id when a guest later claims Apple", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const accepted = await acceptInvitation(invitation.token, "Pappa", null);
    const claimed = await continueWithOAuth({
      provider: "apple",
      subject: "apple-after-invite",
      displayName: "Pappa Apple",
      sessionUserId: accepted.userId,
    });
    assert.equal(claimed.userId, accepted.userId);
    assert.equal(claimed.claimedGuest, true);
    const user = await getUserById(accepted.userId);
    assert.equal(user?.accountState, "active");
    assert.equal(await supervisorCount(student.journey.id, accepted.userId), 1);
  });

  it("keeps the same user_id when a guest later claims Google", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const accepted = await acceptInvitation(invitation.token, "Mamma", null);
    const claimed = await continueWithOAuth({
      provider: "google",
      subject: "google-after-invite",
      sessionUserId: accepted.userId,
    });
    assert.equal(claimed.userId, accepted.userId);
    assert.equal(claimed.claimedGuest, true);
    assert.equal(await supervisorCount(student.journey.id, accepted.userId), 1);
  });

  it("returns 409 on claim collision and leaves the guest history in place", async () => {
    await continueWithOAuth({
      provider: "apple",
      subject: "apple-taken-invite",
      displayName: "Ägare",
    });
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const guest = await acceptInvitation(invitation.token, "Inkräktare", null);
    await assert.rejects(
      () =>
        continueWithOAuth({
          provider: "apple",
          subject: "apple-taken-invite",
          sessionUserId: guest.userId,
        }),
      (error: Error & { code?: string; statusCode?: number }) =>
        error.code === "identity_on_other_user" && error.statusCode === 409,
    );
    const user = await getUserById(guest.userId);
    assert.equal(user?.accountState, "guest");
    assert.equal(await supervisorCount(student.journey.id, guest.userId), 1);
  });

  it("treats invitation replay as already used for a different caller", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const first = await acceptInvitation(invitation.token, "Pappa", null);
    const replay = await acceptInvitation(invitation.token, "Pappa", first.userId);
    assert.equal(replay.alreadyAccepted, true);
    await assert.rejects(
      () => acceptInvitation(invitation.token, "Annan", null),
      (error: Error & { code?: string; statusCode?: number }) =>
        error.code === "already_accepted" && error.statusCode === 409,
    );
    const collab = await getPool().query(
      `SELECT count(*)::int AS n FROM journey_collaborators WHERE journey_id = $1`,
      [student.journey.id],
    );
    assert.equal(collab.rows[0].n, 1);
  });

  it("lets only one of two concurrent accepts win", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const results = await Promise.allSettled([
      acceptInvitation(invitation.token, "Pappa", null),
      acceptInvitation(invitation.token, "Mamma", null),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ userId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const error = rejected[0].reason as Error & {
      code?: string;
      statusCode?: number;
    };
    assert.equal(error.statusCode, 409);
    assert.ok(
      error.code === "already_accepted" || error.code === "accept_failed",
    );
    const collab = await getPool().query(
      `SELECT count(*)::int AS n FROM journey_collaborators
       WHERE journey_id = $1 AND status = 'active'`,
      [student.journey.id],
    );
    assert.equal(collab.rows[0].n, 1);
    const invite = await getPool().query(
      `SELECT status FROM journey_invitations WHERE id = $1`,
      [invitation.id],
    );
    assert.equal(invite.rows[0].status, "accepted");
  });

  it("rejects the student accepting their own invitation", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    await assert.rejects(
      () => acceptInvitation(invitation.token, "Ella", student.userId),
      (error: Error & { statusCode?: number }) => error.statusCode === 403,
    );

    const app = await createTestApp();
    const page = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(student.userId) },
      { method: "GET", url: `/invite/${invitation.token}` },
    );
    assert.equal(page.statusCode, 403);
    assert.match(page.body, /egen körkortsresa/);

    const post = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(student.userId) },
      {
        method: "POST",
        url: `/invite/${invitation.token}/accept`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      },
    );
    assert.equal(post.statusCode, 403);
    await app.close();
  });

  it("keeps /invite as an app link, not public web signup", async () => {
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    assert.match(invitation.inviteUrl, /\/invite\//);
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: `/invite/${invitation.token}`,
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Körpasset-appen/);
    assert.match(page.body, /Anslut som gäst/);
    assert.match(page.body, new RegExp(`href="korpasset://invite/${invitation.token}"`));
    assert.match(page.body, /id="invite-open-app"[^>]*hidden/);
    assert.match(page.body, /noindex, nofollow/);
    assert.doesNotMatch(page.body, /Bli betatestare/);
    assert.doesNotMatch(page.body, /action="\/interest"/);
    assert.doesNotMatch(page.body, /Fortsätt med Apple/);
    await app.close();
  });
});
