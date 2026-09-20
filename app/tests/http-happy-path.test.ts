import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { recommendNextFocus } from "../src/services/recommendations.js";
import { createTestApp } from "./helpers.js";
import {
  cookiesFromResponse,
  extractInviteToken,
  extractPathFromRedirect,
  formBody,
  injectWithSession,
  mergeCookies,
} from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

describe("HTTP happy path (two isolated sessions)", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("completes vertical slice via HTTP with student and supervisor sessions", async () => {
    const app = await createTestApp();
    let studentCookies = {};
    let supervisorCookies = {};

    // A1–A3: new student session, create journey
    const startResponse = await app.inject({
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Ella" }),
    });
    assert.equal(startResponse.statusCode, 302, "start should redirect");
    studentCookies = mergeCookies(studentCookies, startResponse);
    const journeyId = extractPathFromRedirect(startResponse, /^\/journey\/([^/]+)$/);
    assert.ok(journeyId, "journey id from redirect");

    const journeyGet = await injectWithSession(app, studentCookies, {
      method: "GET",
      url: `/journey/${journeyId}`,
    });
    assert.equal(journeyGet.statusCode, 200, "journey page loads");
    assert.match(journeyGet.body, /Ella/);

    // A4–A5: create invitation and extract invite URL/token
    const inviteResponse = await injectWithSession(app, studentCookies, {
      method: "POST",
      url: `/journey/${journeyId}/invitations`,
    });
    assert.equal(inviteResponse.statusCode, 200, "invitation page loads");
    assert.match(inviteResponse.body, /Kopiera länk/);
    assert.match(inviteResponse.body, /id="invite-url"/);
    const inviteToken = extractInviteToken(inviteResponse.body);

    // B1–B3: separate supervisor session accepts invitation
    const invitePage = await app.inject({
      method: "GET",
      url: `/invite/${inviteToken}`,
    });
    assert.equal(invitePage.statusCode, 200);
    assert.match(invitePage.body, /Ella/);

    const acceptResponse = await app.inject({
      method: "POST",
      url: `/invite/${inviteToken}/accept`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ name: "Pappa" }),
    });
    assert.equal(acceptResponse.statusCode, 302, "accept should redirect");
    supervisorCookies = mergeCookies(supervisorCookies, acceptResponse);
    assert.equal(
      acceptResponse.headers.location,
      `/journey/${journeyId}`,
      "supervisor lands on journey",
    );

    const collab = await getPool().query(
      `SELECT jc.role, jc.status, u.display_name
       FROM journey_collaborators jc
       JOIN users u ON u.id = jc.user_id
       WHERE jc.journey_id = $1`,
      [journeyId],
    );
    assert.equal(collab.rowCount, 1);
    assert.equal(collab.rows[0].role, "supervisor");
    assert.equal(collab.rows[0].status, "active");
    assert.equal(collab.rows[0].display_name, "Pappa");

    // C: focus selection with 3 skills
    const skills = await getPool().query(
      `SELECT id FROM skills ORDER BY skill_key LIMIT 3`,
    );
    const skillIds = skills.rows.map((row) => row.id as string);

    const focusPage = await injectWithSession(app, studentCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/new`,
    });
    assert.equal(focusPage.statusCode, 200);
    assert.match(focusPage.body, /Vad tränar ni på idag/);
    assert.match(focusPage.body, /[1-3] av 3 valda/);

    const driveCreate = await injectWithSession(app, studentCookies, {
      method: "POST",
      url: `/journey/${journeyId}/drives`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ skill_ids: skillIds }),
    });
    assert.equal(driveCreate.statusCode, 302, "drive create redirects");
    const driveId = extractPathFromRedirect(
      driveCreate,
      /^\/journey\/[^/]+\/drive\/([^/]+)$/,
    );
    assert.ok(driveId, "drive id from redirect");

    // Refresh active drive page
    const drivePage = await injectWithSession(app, studentCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/${driveId}`,
    });
    assert.equal(drivePage.statusCode, 200);
    assert.match(drivePage.body, /Körpass pågår/);
    assert.match(drivePage.body, /Körpasset klart/);

    const driveRefresh = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/${driveId}`,
    });
    assert.equal(driveRefresh.statusCode, 200);
    assert.match(driveRefresh.body, /Körpass pågår/);

    const supervisorUserId = (
      await getPool().query(
        `SELECT supervisor_user_id FROM drives WHERE id = $1`,
        [driveId],
      )
    ).rows[0].supervisor_user_id as string;

    // E: end drive (supervisor assigned to this drive)
    const endResponse = await injectWithSession(app, supervisorCookies, {
      method: "POST",
      url: `/journey/${journeyId}/drive/${driveId}/end`,
    });
    assert.equal(endResponse.statusCode, 302);
    assert.equal(
      endResponse.headers.location,
      `/journey/${journeyId}/drive/${driveId}/rate`,
    );

    const endedDrive = await getPool().query(
      `SELECT ended_at FROM drives WHERE id = $1`,
      [driveId],
    );
    assert.ok(endedDrive.rows[0].ended_at);

    // F: rating page and submit
    const ratePage = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/${driveId}/rate`,
    });
    assert.equal(ratePage.statusCode, 200);
    assert.match(ratePage.body, /Hur gick det/);
    assert.match(ratePage.body, /Utan hjälp/);
    assert.match(ratePage.body, /Med påminnelse/);
    assert.match(ratePage.body, /Behöver hjälp/);
    assert.match(ratePage.body, /rating-option--independent/);
    assert.match(ratePage.body, /rating-option--with_support/);
    assert.match(ratePage.body, /rating-option--needs_help/);

    const ratingPayload = formBody({
      skill_ids: skillIds,
      [`assessment_${skillIds[0]}`]: "needs_help",
      [`assessment_${skillIds[1]}`]: "with_support",
      [`assessment_${skillIds[2]}`]: "independent",
    });

    const ratePost = await injectWithSession(app, supervisorCookies, {
      method: "POST",
      url: `/journey/${journeyId}/drive/${driveId}/rate`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: ratingPayload,
    });
    assert.equal(ratePost.statusCode, 302);
    assert.equal(
      ratePost.headers.location,
      `/journey/${journeyId}/drive/${driveId}/done`,
    );

    const observations = await getPool().query(
      `SELECT skill_id, assessment, observer_user_id, source_type
       FROM drive_observations
       WHERE drive_id = $1
       ORDER BY created_at`,
      [driveId],
    );
    assert.equal(observations.rowCount, 3);
    assert.ok(
      observations.rows.every((row) => row.observer_user_id === supervisorUserId),
    );
    assert.ok(
      observations.rows.every((row) => row.source_type === "supervisor"),
    );

    const recommendations = await recommendNextFocus(journeyId);
    const needsHelpIndex = recommendations.findIndex(
      (rec) => rec.skillId === skillIds[0],
    );
    const withSupportIndex = recommendations.findIndex(
      (rec) => rec.skillId === skillIds[1],
    );
    const independentIndex = recommendations.findIndex(
      (rec) => rec.skillId === skillIds[2],
    );
    assert.ok(needsHelpIndex >= 0, "needs_help skill recommended");
    assert.ok(withSupportIndex >= 0, "with_support skill recommended");
    assert.ok(needsHelpIndex < withSupportIndex, "needs_help before with_support");
    assert.equal(
      independentIndex,
      -1,
      "independent should not be prioritized over needs_help/with_support",
    );

    // G: done page and refresh
    const skillTitles = await getPool().query(
      `SELECT sd.title
       FROM skills s
       JOIN skill_definitions sd ON sd.skill_id = s.id AND sd.taxonomy_version = 1
       WHERE s.id = ANY($1::uuid[])
       ORDER BY sd.sort_order`,
      [skillIds],
    );
    const [firstTitle, secondTitle, thirdTitle] = skillTitles.rows.map(
      (row) => row.title as string,
    );

    const donePage = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/${driveId}/done`,
    });
    assert.equal(donePage.statusCode, 200);
    assert.match(donePage.body, /Så gick det/);
    assert.match(donePage.body, /Nästa gång/);
    assert.match(donePage.body, new RegExp(firstTitle));
    assert.match(donePage.body, new RegExp(secondTitle));
    assert.match(donePage.body, new RegExp(thirdTitle));
    assert.match(donePage.body, /Behöver hjälp/);
    assert.match(donePage.body, /Med påminnelse/);
    assert.match(donePage.body, /Utan hjälp/);
    assert.match(donePage.body, /drive-recap-list/);

    const doneRefresh = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: `/journey/${journeyId}/drive/${driveId}/done`,
    });
    assert.equal(doneRefresh.statusCode, 200);

    const obsCountAfterDoneRefresh = await getPool().query(
      `SELECT count(*)::int AS count FROM drive_observations WHERE drive_id = $1`,
      [driveId],
    );
    assert.equal(obsCountAfterDoneRefresh.rows[0].count, 3);

    // Rating retry must not duplicate observations
    const rateRetry = await injectWithSession(app, supervisorCookies, {
      method: "POST",
      url: `/journey/${journeyId}/drive/${driveId}/rate`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: ratingPayload,
    });
    assert.equal(rateRetry.statusCode, 302);
    assert.equal(
      rateRetry.headers.location,
      `/journey/${journeyId}/drive/${driveId}/done`,
    );

    const obsCountAfterRetry = await getPool().query(
      `SELECT count(*)::int AS count FROM drive_observations WHERE drive_id = $1`,
      [driveId],
    );
    assert.equal(obsCountAfterRetry.rows[0].count, 3);

    // GET / returns to journey for each session
    const studentHome = await injectWithSession(app, studentCookies, {
      method: "GET",
      url: "/",
    });
    assert.equal(studentHome.statusCode, 302);
    assert.equal(studentHome.headers.location, `/journey/${journeyId}`);

    const supervisorHome = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: "/",
    });
    assert.equal(supervisorHome.statusCode, 302);
    assert.equal(supervisorHome.headers.location, `/journey/${journeyId}`);

    const supervisorJourney = await injectWithSession(app, supervisorCookies, {
      method: "GET",
      url: `/journey/${journeyId}`,
    });
    assert.equal(supervisorJourney.statusCode, 200);
    assert.match(supervisorJourney.body, /Ella/);

    // Sessions must not share cookies
    assert.notEqual(
      cookiesFromResponse(startResponse)[config.sessionCookieName],
      cookiesFromResponse(acceptResponse)[config.sessionCookieName],
      "student and supervisor sessions are isolated",
    );

    await app.close();
  });
});
