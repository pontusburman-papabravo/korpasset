import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { continueWithOAuth } from "../src/services/oauth-accounts.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { STUDENT_START_PATH, studentStartUrl } from "../src/http/onboarding-pages.js";
import { createTestApp } from "./helpers.js";
import { formBody, injectWithSession } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string) {
  return { bilklar_session: createSessionToken(userId) };
}

describe("parent initiates, student owns the journey", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("lets a parent send the student into the app without creating the journey", async () => {
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: "/onboarding?som=handledare",
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Få in den som tar körkort/);
    assert.match(page.body, /ägs av eleven/);
    assert.match(page.body, /id="student-start-url"/);
    assert.match(page.body, new RegExp(STUDENT_START_PATH.replace("?", "\\?")));
    assert.match(page.body, /Kopiera länk/);
    assert.doesNotMatch(page.body, /action="\/start"/);
    assert.doesNotMatch(page.body, /Starta min körkortsresa/);
    assert.equal(studentStartUrl().includes(STUDENT_START_PATH), true);
    await app.close();
  });

  it("warns that the student form creates the opener's own journey", async () => {
    const app = await createTestApp();
    const page = await app.inject({ method: "GET", url: "/onboarding?som=elev" });
    assert.match(page.body, /din<\/strong> körkortsresa/);
    assert.match(page.body, /Om du är förälder till den som tar körkort/);
    assert.match(page.body, /Precis börjat/);
    assert.match(page.body, /Har kört ett tag/);
    assert.match(page.body, /Nära uppkörning/);
    assert.match(page.body, /type="radio" name="practice_stage" value="just_started"/);
    assert.match(page.body, /type="radio" name="practice_stage" value="building"/);
    await app.close();
  });

  it("makes inviting the parent the first action on an empty student journey", async () => {
    const { journey, userId } = await createJourneyForStudent("Ludvig", null, "just_started");
    const app = await createTestApp();
    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(home.body, /Bjud in den som kör med dig/);
    assert.match(home.body, /Körkortsresan tillhör dig/);
    assert.match(home.body, /action="\/journey\/[^"]+\/invitations"/);
    assert.doesNotMatch(home.body, /Ett första kort pass/);
    await app.close();
  });

  it("treats a first beginner drive as a short first pass, not a mid-journey recap", async () => {
    const { journey, userId } = await createJourneyForStudent("Emma", null, "just_started");
    const invitation = await createInvitation(journey.id, userId);
    await acceptInvitation(invitation.token, "Mamma");
    const app = await createTestApp();
    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(home.body, /Ett första kort pass/);
    assert.match(home.body, /lugn trafik/);
    assert.doesNotMatch(home.body, /Dags att komma ut/);
    assert.doesNotMatch(home.body, /Bjud in den som kör med dig/);
    await app.close();
  });

  it("keeps the chooser from making the parent the student", async () => {
    const apple = await continueWithOAuth({
      provider: "apple",
      subject: "apple-parent-chooser",
      displayName: "Jonas",
    });
    const app = await createTestApp();
    const chooser = await injectWithSession(app, session(apple.userId), {
      method: "GET",
      url: "/onboarding",
    });
    assert.match(chooser.body, /inte den som hittade Körpasset/);
    assert.match(chooser.body, /inte barnets/);
    assert.match(chooser.body, /Du kan sätta igång/);
    await app.close();
  });
});
