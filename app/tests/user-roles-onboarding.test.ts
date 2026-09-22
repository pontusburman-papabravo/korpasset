import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import {
  acceptInvitation,
  createInvitation,
  parseInvitationInput,
} from "../src/services/invitations.js";
import {
  createJourneyForStudent,
  listUserJourneyMemberships,
} from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("parseInvitationInput", () => {
  it("accepts URL, path and raw token", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789_-abc";
    assert.equal(parseInvitationInput(`${config.appBaseUrl}/invite/${token}`), token);
    assert.equal(parseInvitationInput(`https://korpasset.se/invite/${token}`), token);
    assert.equal(parseInvitationInput(`/invite/${token}`), token);
    assert.equal(parseInvitationInput(`invite/${token}`), token);
    assert.equal(parseInvitationInput(token), token);
  });

  it("rejects empty or malformed input", () => {
    assert.equal(parseInvitationInput(""), null);
    assert.equal(parseInvitationInput("   "), null);
    assert.equal(parseInvitationInput("hej"), null);
    assert.equal(parseInvitationInput("https://korpasset.se/onboarding"), null);
  });
});

describe("user roles: student-owned journey, supervisor is also a user", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("keeps student onboarding primary and offers supervisor join", async () => {
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Vad heter du/);
    assert.match(page.body, /Starta min körkortsresa/);
    assert.match(page.body, /Jag är handledare/);
    assert.match(page.body, /href="\/onboarding\/handledare"/);
    assert.match(page.body, /Du blir också en användare när du ansluter/);
    await app.close();
  });

  it("creates a user only when the student starts a journey", async () => {
    const app = await createTestApp();
    const before = await getPool().query(`SELECT count(*)::int AS count FROM users`);
    assert.equal(before.rows[0].count, 0);

    const handledare = await app.inject({ method: "GET", url: "/onboarding/handledare" });
    assert.equal(handledare.statusCode, 200);
    assert.match(handledare.body, /Anslut som handledare/);
    assert.match(handledare.body, /samma slags användare som eleven/);
    const afterView = await getPool().query(`SELECT count(*)::int AS count FROM users`);
    assert.equal(afterView.rows[0].count, 0);

    const start = await app.inject({
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Ella" }),
    });
    assert.equal(start.statusCode, 302);
    const users = await getPool().query(
      `SELECT u.id, u.display_name, j.student_user_id
       FROM users u
       JOIN driving_journeys j ON j.student_user_id = u.id`,
    );
    assert.equal(users.rowCount, 1);
    assert.equal(users.rows[0].display_name, "Ella");
    await app.close();
  });

  it("does not create a supervisor user until the invite is accepted", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const app = await createTestApp();

    const opened = await app.inject({
      method: "POST",
      url: "/onboarding/handledare",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ invite: invitation.inviteUrl }),
    });
    assert.equal(opened.statusCode, 302);
    assert.equal(opened.headers.location, `/invite/${invitation.token}`);

    const usersBeforeAccept = await getPool().query(`SELECT count(*)::int AS count FROM users`);
    assert.equal(usersBeforeAccept.rows[0].count, 1);

    const accept = await app.inject({
      method: "POST",
      url: `/invite/${invitation.token}/accept`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Pappa" }),
    });
    assert.equal(accept.statusCode, 302);

    const users = await getPool().query(
      `SELECT display_name FROM users ORDER BY created_at`,
    );
    assert.equal(users.rowCount, 2);
    assert.deepEqual(
      users.rows.map((row) => row.display_name),
      ["Ella", "Pappa"],
    );

    const collab = await getPool().query(
      `SELECT jc.role, u.display_name
       FROM journey_collaborators jc
       JOIN users u ON u.id = jc.user_id
       WHERE jc.journey_id = $1`,
      [journey.id],
    );
    assert.equal(collab.rowCount, 1);
    assert.equal(collab.rows[0].role, "supervisor");
    assert.equal(collab.rows[0].display_name, "Pappa");
    await app.close();
  });

  it("opens an invite from a pasted path or raw token", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const app = await createTestApp();

    const fromPath = await app.inject({
      method: "POST",
      url: "/onboarding/handledare",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ invite: `/invite/${invitation.token}` }),
    });
    assert.equal(fromPath.statusCode, 302);
    assert.equal(fromPath.headers.location, `/invite/${invitation.token}`);

    const fromToken = await app.inject({
      method: "POST",
      url: "/onboarding/handledare",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ invite: invitation.token }),
    });
    assert.equal(fromToken.statusCode, 302);
    assert.equal(fromToken.headers.location, `/invite/${invitation.token}`);
    await app.close();
  });

  it("rejects a missing or unknown invite without creating a user", async () => {
    const app = await createTestApp();
    const empty = await app.inject({
      method: "POST",
      url: "/onboarding/handledare",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ invite: "hej" }),
    });
    assert.equal(empty.statusCode, 400);
    assert.match(empty.body, /Klistra in länken från eleven/);

    const unknown = await app.inject({
      method: "POST",
      url: "/onboarding/handledare",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ invite: "abcdefghijklmnopqrstuvwxyz0123" }),
    });
    assert.equal(unknown.statusCode, 404);
    assert.match(unknown.body, /Inbjudan hittades inte/);

    const users = await getPool().query(`SELECT count(*)::int AS count FROM users`);
    assert.equal(users.rows[0].count, 0);
    await app.close();
  });

  it("lists student role first on the account page", async () => {
    const student = await createJourneyForStudent("Ella");
    const other = await createJourneyForStudent("Clara");
    const invitation = await createInvitation(other.journey.id, other.userId);
    await acceptInvitation(invitation.token, "Ella", student.userId);

    const memberships = await listUserJourneyMemberships(student.userId);
    assert.equal(memberships.length, 2);
    assert.equal(memberships[0].role, "student");
    assert.equal(memberships[0].journeyId, student.journey.id);
    assert.equal(memberships[1].role, "supervisor");
    assert.equal(memberships[1].studentName, "Clara");

    const app = await createTestApp();
    const page = await injectWithSession(app, session(student.userId), {
      method: "GET",
      url: "/konto",
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Dina resor/);
    assert.match(page.body, /Du är en användare/);
    assert.match(page.body, /Elev · din körkortsresa/);
    assert.match(page.body, /Handledare · Clara/);
    assert.match(page.body, new RegExp(`/journey/${student.journey.id}`));
    assert.match(page.body, new RegExp(`/journey/${other.journey.id}`));
    assert.match(page.body, /Anslut till en elevresa/);
    await app.close();
  });
});
