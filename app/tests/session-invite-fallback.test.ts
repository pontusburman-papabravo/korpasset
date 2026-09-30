import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("session and spent-invite fallback", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("sends a logged-out product page to login and keeps the destination", async () => {
    const app = await createTestApp();
    const { journey } = await createJourneyForStudent("Ella");
    const response = await app.inject({
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, `/app?next=${encodeURIComponent(`/journey/${journey.id}`)}`);
    assert.doesNotMatch(String(response.body), /Session saknas/);

    const login = await app.inject({
      method: "GET",
      url: String(response.headers.location),
    });
    assert.equal(login.statusCode, 200);
    assert.match(login.body, /Fortsätt in i Körpasset/);
    assert.match(login.body, new RegExp(`data-return-to="/journey/${journey.id}"`));
    assert.doesNotMatch(login.body, /Session saknas/);
    assert.doesNotMatch(login.body, /consent\.js|googletagmanager/);

    const evil = await app.inject({
      method: "GET",
      url: "/app?next=https://evil.example/phish",
    });
    assert.match(evil.body, /data-return-to="\/app"/);

    const json = await app.inject({
      method: "GET",
      url: `/journey/${journey.id}`,
      headers: { accept: "application/json" },
    });
    assert.equal(json.statusCode, 401);
    assert.match(json.body, /Session required/);
    await app.close();
  });

  it("lets the accepting supervisor reopen a spent invite", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(journey.id, studentId);
    const supervisor = await acceptInvitation(invitation.token, "Pappa", null);
    const app = await createTestApp();

    const stranger = await app.inject({
      method: "GET",
      url: `/invite/${invitation.token}`,
    });
    assert.equal(stranger.statusCode, 410);
    assert.match(stranger.body, /Inbjudan redan använd/);
    assert.match(stranger.body, /Be om en ny länk/);

    const owner = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(supervisor.userId) },
      { method: "GET", url: `/invite/${invitation.token}` },
    );
    assert.equal(owner.statusCode, 302);
    assert.equal(owner.headers.location, `/journey/${journey.id}`);

    const stray = await app.inject({
      method: "POST",
      url: `/invite/${invitation.token}/accept`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Annan" }),
    });
    assert.equal(stray.statusCode, 409);
    assert.match(stray.body, /Inbjudan redan använd/);
    await app.close();
  });

  it("redirects onboarding home when the session already has a journey", async () => {
    const { userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(userId) },
      { method: "GET", url: "/onboarding" },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/app");
    await app.close();
  });
});
