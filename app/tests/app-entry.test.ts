import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { getPool } from "../src/db/pool.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createGuestUser } from "../src/services/users.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const previousEnv: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined): void {
  if (!(name in previousEnv)) previousEnv[name] = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnv(): void {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    delete previousEnv[name];
  }
}

async function addSupervisor(
  studentJourneyId: string,
  studentId: string,
  supervisorName: string,
  sessionUserId: string | null = null,
) {
  const invitation = await createInvitation(studentJourneyId, studentId);
  return acceptInvitation(invitation.token, supervisorName, sessionUserId);
}

describe("app entry (GET /app) and production onboarding", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("shows Apple/Google login on /app when there is no session", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/app" });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Fortsätt med Apple/);
    assert.match(response.body, /Fortsätt med Google/);
    assert.match(response.body, /noindex, nofollow/);
    assert.doesNotMatch(response.body, /Bli betatestare/);
    assert.doesNotMatch(response.body, /action="\/interest"/);
    await app.close();
  });

  it("sends an active user without a journey to onboarding", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-app-empty",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/app" },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, "/onboarding");

    const onboarding = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/onboarding" },
    );
    assert.equal(onboarding.statusCode, 200);
    assert.match(onboarding.body, /Hur är du med i övningskörningen/);
    assert.match(onboarding.body, /Jag är handledare eller förälder/);
    const studentPath = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/onboarding?som=elev" },
    );
    assert.match(studentPath.body, /Starta min körkortsresa/);
    await app.close();
  });

  it("sends an active user with one journey to that journey", async () => {
    const apple = await continueWithOAuth({
      provider: "google",
      subject: "google-app-one",
      displayName: "Ella",
    });
    const { journey } = await createJourneyForStudent("Ella", apple.userId);
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/app" },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, `/journey/${journey.id}`);
    await app.close();
  });

  it("shows the journey picker for an active user with several journeys", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-app-many",
      displayName: "Pappa",
    });
    const clara = await createJourneyForStudent("Clara");
    const ella = await createJourneyForStudent("Ella");
    await addSupervisor(clara.journey.id, clara.userId, "Pappa", apple.userId);
    await addSupervisor(ella.journey.id, ella.userId, "Pappa", apple.userId);

    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/app" },
    );
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<h1>Välj elev<\/h1>/);
    assert.match(response.body, /Clara/);
    assert.match(response.body, /Ella/);
    assert.doesNotMatch(response.body, /Starta körpass/);
    await app.close();
  });

  it("does not let a guest create a student journey in production", async () => {
    setEnv("NODE_ENV", "production");
    const guest = await createGuestUser("Ella");
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(guest.id) },
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      },
    );
    assert.equal(response.statusCode, 403);
    assert.match(response.body, /Fortsätt med Apple/);
    const journeys = await getPool().query(
      `SELECT count(*)::int AS n FROM driving_journeys WHERE student_user_id = $1`,
      [guest.id],
    );
    assert.equal(journeys.rows[0].n, 0);

    const anonymous = await app.inject({
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Ella" }),
    });
    assert.equal(anonymous.statusCode, 403);

    const onboarding = await app.inject({ method: "GET", url: "/onboarding" });
    assert.equal(onboarding.statusCode, 200);
    assert.match(onboarding.body, /Fortsätt med Apple/);
    assert.doesNotMatch(onboarding.body, /Starta min körkortsresa/);
    await app.close();
  });

  it("lets an active Apple/Google user create a student journey", async () => {
    setEnv("NODE_ENV", "production");
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-create-journey",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const response = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      {
        method: "POST",
        url: "/start",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: formBody({ name: "Ella" }),
      },
    );
    assert.equal(response.statusCode, 302);
    const location = String(response.headers.location);
    assert.match(location, /^\/journey\//);
    const journeyId = location.slice("/journey/".length);
    const row = await getPool().query(
      `SELECT student_user_id, status FROM driving_journeys WHERE id = $1`,
      [journeyId],
    );
    assert.equal(row.rows[0].student_user_id, apple.userId);
    assert.equal(row.rows[0].status, "active");
    await app.close();
  });

  it("keeps / as the waitlist without product registration", async () => {
    const apple = await continueWithOAuth({
      provider: "google",
      subject: "google-waitlist-home",
      displayName: "Ella",
    });
    const app = await createTestApp();
    const anonymous = await app.inject({ method: "GET", url: "/" });
    assert.equal(anonymous.statusCode, 200);
    assert.match(anonymous.body, /Bli betatestare/);
    assert.doesNotMatch(anonymous.body, /Fortsätt med Apple/);
    assert.doesNotMatch(anonymous.body, /Starta min körkortsresa/);

    const signedIn = await injectWithSession(
      app,
      { bilklar_session: createSessionToken(apple.userId) },
      { method: "GET", url: "/" },
    );
    assert.equal(signedIn.statusCode, 200);
    assert.match(signedIn.body, /Bli betatestare/);
    assert.doesNotMatch(signedIn.body, /Fortsätt med Apple/);
    await app.close();
  });
});
