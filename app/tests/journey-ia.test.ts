import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import {
  journeyIdentityForRole,
  supervisorJourneyTitle,
} from "../src/http/journey-identity.js";
import {
  acceptInvitation,
  createInvitation,
} from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  getActiveNextDrivePlan,
  saveNextDrivePlan,
} from "../src/services/next-drive-plan.js";
import { createTestApp } from "./helpers.js";
import {
  formBody,
  injectWithSession,
  mergeCookies,
  type SessionCookies,
} from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

function session(userId: string): SessionCookies {
  return { bilklar_session: createSessionToken(userId) };
}

function tabLabels(html: string): string[] {
  const nav = html.match(/<nav class="app-tabbar"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(nav, "tab bar missing");
  return [...nav[1].matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]);
}

function tabHrefs(html: string): string[] {
  const nav = html.match(/<nav class="app-tabbar"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(nav, "tab bar missing");
  return [...nav[1].matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);
}

async function skillIdsByKeys(keys: string[]): Promise<string[]> {
  const result = await getPool().query(
    `SELECT skill_key, id FROM skills WHERE skill_key = ANY($1::text[])`,
    [keys],
  );
  const byKey = new Map(result.rows.map((row) => [String(row.skill_key), String(row.id)]));
  return keys.map((key) => {
    const id = byKey.get(key);
    assert.ok(id, `missing skill ${key}`);
    return id;
  });
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

describe("journey identity helpers", () => {
  it("uses first name and Swedish possessive for supervisor titles", () => {
    assert.equal(supervisorJourneyTitle("Clara Berg"), "Claras körkortsresa");
    assert.equal(supervisorJourneyTitle("Pontus Burman"), "Pontus körkortsresa");
    assert.equal(journeyIdentityForRole("student", "Pontus Burman").title, "Min körkortsresa");
    assert.equal(journeyIdentityForRole("student", "Pontus Burman").roleLine, "Elev · B-körkort");
    assert.equal(
      journeyIdentityForRole("supervisor", "Pontus Burman").roleLine,
      "Du är handledare",
    );
  });
});

describe("four-tab IA and journey context", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("uses the same four tab names for student and supervisor", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const supervisor = await addSupervisor(journey.id, studentId, "Pappa");
    const app = await createTestApp();

    const studentHome = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    const supervisorHome = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });

    assert.deepEqual(tabLabels(studentHome.body), ["Resa", "Nästa", "Utveckling", "Mer"]);
    assert.deepEqual(tabLabels(supervisorHome.body), ["Resa", "Nästa", "Utveckling", "Mer"]);
    assert.deepEqual(tabHrefs(studentHome.body), ["/resa", "/nasta", "/utveckling", "/mer"]);
    assert.doesNotMatch(studentHome.body, /app-bar__nav/);
    assert.doesNotMatch(studentHome.body, /<a href="\/konto">Konto<\/a>/);
    assert.doesNotMatch(studentHome.body, /<a href="\/hjalp">Hjälp<\/a>/);
    assert.doesNotMatch(studentHome.body, />Fokus</);
    await app.close();
  });

  it("keeps Utveckling off /konto and remembers the active journey through Mer", async () => {
    const owned = await createJourneyForStudent("Ella");
    const other = await createJourneyForStudent("Clara");
    await addSupervisor(other.journey.id, other.userId, "Ella", owned.userId);
    const app = await createTestApp();
    let jar = session(owned.userId);

    const openB = await injectWithSession(app, jar, {
      method: "GET",
      url: `/journey/${other.journey.id}`,
    });
    assert.equal(openB.statusCode, 200);
    assert.match(openB.body, /Claras körkortsresa/);
    assert.match(openB.body, /Du är handledare/);
    jar = mergeCookies(jar, openB);
    assert.equal(jar[config.activeJourneyCookieName], other.journey.id);

    const mer = await injectWithSession(app, jar, { method: "GET", url: "/mer" });
    jar = mergeCookies(jar, mer);
    assert.equal(mer.statusCode, 200);
    assert.match(mer.body, /Claras körkortsresa/);
    assert.match(mer.body, /Du är handledare/);
    assert.match(mer.body, /Byt körkortsresa/);
    assert.match(mer.body, /href="\/konto"/);
    assert.match(mer.body, /href="\/hjalp"/);
    assert.equal(tabHrefs(mer.body).includes("/konto"), false);

    const konto = await injectWithSession(app, jar, { method: "GET", url: "/konto" });
    jar = mergeCookies(jar, konto);
    assert.equal(konto.statusCode, 200);
    assert.doesNotMatch(konto.body, /<a href="\/utveckling">[\s\S]*Konto/);

    const utveckling = await injectWithSession(app, jar, {
      method: "GET",
      url: "/utveckling",
    });
    assert.equal(utveckling.statusCode, 302);
    assert.equal(utveckling.headers.location, `/journey/${other.journey.id}/utveckling`);

    const hjalp = await injectWithSession(app, jar, { method: "GET", url: "/hjalp" });
    jar = mergeCookies(jar, hjalp);
    const nasta = await injectWithSession(app, jar, { method: "GET", url: "/nasta" });
    assert.equal(nasta.statusCode, 302);
    assert.equal(nasta.headers.location, `/journey/${other.journey.id}/nasta`);

    const openA = await injectWithSession(app, jar, {
      method: "GET",
      url: `/journey/${owned.journey.id}`,
    });
    jar = mergeCookies(jar, openA);
    assert.match(openA.body, /Min körkortsresa/);
    assert.match(openA.body, /Elev · B-körkort/);
    assert.equal(jar[config.activeJourneyCookieName], owned.journey.id);

    const utvecklingA = await injectWithSession(app, jar, {
      method: "GET",
      url: "/utveckling",
    });
    assert.equal(utvecklingA.headers.location, `/journey/${owned.journey.id}/utveckling`);
    await app.close();
  });

  it("shows role-aware heroes and hides Inte angivet from identity", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Pontus Burman");
    const supervisor = await addSupervisor(journey.id, studentId, "Pappa");
    const app = await createTestApp();

    const studentHome = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    const identity = studentHome.body.match(
      /<div class="journey-identity">[\s\S]*?<\/div>/,
    )?.[0];
    assert.ok(identity);
    assert.match(identity, /Min körkortsresa/);
    assert.match(identity, /Elev · B-körkort/);
    assert.doesNotMatch(identity, /Inte angivet/);
    assert.doesNotMatch(identity, /Pontus Burman/);
    assert.match(studentHome.body, /Planera körpass/);
    assert.doesNotMatch(studentHome.body, /Vad tränar ni på idag\?/);

    const supervisorHome = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(supervisorHome.body, /Pontus körkortsresa/);
    assert.match(supervisorHome.body, /Du är handledare/);
    assert.match(supervisorHome.body, /Välj dagens fokus/);
    const supervisorIdentity = supervisorHome.body.match(
      /<div class="journey-identity">[\s\S]*?<\/div>/,
    )?.[0];
    assert.ok(supervisorIdentity);
    assert.doesNotMatch(supervisorIdentity, /Inte angivet/);
    await app.close();
  });

  it("shows role and last-drive metadata on picker cards", async () => {
    const owned = await createJourneyForStudent("Ella");
    const other = await createJourneyForStudent("Clara");
    await addSupervisor(other.journey.id, other.userId, "Ella", owned.userId);
    const app = await createTestApp();
    const page = await injectWithSession(app, session(owned.userId), {
      method: "GET",
      url: "/app",
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /class="card journey-choice"/);
    assert.match(page.body, /Min körkortsresa/);
    assert.match(page.body, /Du är elev · ingen körning ännu/);
    assert.match(page.body, /Claras körkortsresa/);
    assert.match(page.body, /Du är handledare · ingen körning ännu/);
    await app.close();
  });

  it("keeps next-drive plans journey-scoped and visible to both roles", async () => {
    const a = await createJourneyForStudent("Ella");
    const b = await createJourneyForStudent("Clara");
    const supervisor = await addSupervisor(b.journey.id, b.userId, "Ella", a.userId);
    await addSupervisor(a.journey.id, a.userId, "Pappa");
    const keys = [
      "intersections_right_hand_rule",
      "intersections_give_way",
      "intersections_traffic_lights",
    ];
    const skillIds = await skillIdsByKeys(keys);

    await saveNextDrivePlan(b.journey.id, supervisor.userId, skillIds);
    const studentPlan = await getActiveNextDrivePlan(b.journey.id);
    assert.ok(studentPlan);
    assert.equal(studentPlan.skills.length, 3);
    assert.equal(studentPlan.plannedByName, "Ella");
    assert.equal(await getActiveNextDrivePlan(a.journey.id), null);

    const leaked = await getPool().query(
      `SELECT count(*)::int AS count FROM training_focus_items
       WHERE journey_id = $1 AND status = 'active'`,
      [a.journey.id],
    );
    assert.equal(leaked.rows[0].count, 0);

    const app = await createTestApp();
    const studentNext = await injectWithSession(app, session(b.userId), {
      method: "GET",
      url: `/journey/${b.journey.id}/nasta`,
    });
    assert.match(studentNext.body, /Planerat av Ella/);
    assert.match(studentNext.body, /Högerregeln/);
    assert.match(studentNext.body, /Så övar ni/);

    const supervisorNext = await injectWithSession(app, session(supervisor.userId), {
      method: "GET",
      url: `/journey/${b.journey.id}/nasta`,
    });
    assert.match(supervisorNext.body, /Högerregeln/);
    assert.match(supervisorNext.body, /Väjningsplikt och stopp/);
    assert.match(supervisorNext.body, /Trafikljus/);

    const studentPlanSave = await saveNextDrivePlan(a.journey.id, a.userId, skillIds.slice(0, 2));
    assert.equal(studentPlanSave.plan.skills.length, 2);
    const stillB = await getActiveNextDrivePlan(b.journey.id);
    assert.equal(stillB?.skills.length, 3);
    await app.close();
  });

  it("lets either role save a plan over HTTP and open training guidance", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const supervisor = await addSupervisor(journey.id, studentId, "Pappa");
    const skillIds = await skillIdsByKeys([
      "intersections_right_hand_rule",
      "intersections_traffic_lights",
    ]);
    const app = await createTestApp();

    const saved = await injectWithSession(app, session(supervisor.userId), {
      method: "POST",
      url: `/journey/${journey.id}/plan`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ skill_ids: skillIds }),
    });
    assert.equal(saved.statusCode, 302);
    assert.equal(saved.headers.location, `/journey/${journey.id}/nasta`);

    const studentHome = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(studentHome.body, /Planerat av Pappa/);
    assert.match(studentHome.body, /Ändra plan/);
    assert.match(studentHome.body, /Så övar ni/);

    const guide = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/guide/intersections_right_hand_rule`,
    });
    assert.equal(guide.statusCode, 200);
    assert.match(guide.body, /Högerregeln/);
    assert.match(guide.body, /Så övar ni/);
    assert.match(guide.body, /Som handledare/);

    const events = await getPool().query(
      `SELECT event_name FROM product_events
       WHERE journey_id = $1 AND event_name IN ('next_drive_plan_created', 'training_guidance_opened')
       ORDER BY event_name`,
      [journey.id],
    );
    assert.deepEqual(
      events.rows.map((row) => row.event_name),
      ["next_drive_plan_created", "training_guidance_opened"],
    );

    const planPage = await injectWithSession(app, session(studentId), {
      method: "GET",
      url: `/journey/${journey.id}/drive/new`,
    });
    assert.match(planPage.body, /<h1>Vad tränar ni på idag\?<\/h1>/);
    assert.match(planPage.body, /Spara plan/);
    await app.close();
  });

  it("serializes concurrent plan saves so one writer fully replaces the other", async () => {
    const { journey, userId: studentId } = await createJourneyForStudent("Ella");
    const supervisor = await addSupervisor(journey.id, studentId, "Pappa");
    const studentSkills = await skillIdsByKeys([
      "intersections_right_hand_rule",
      "intersections_give_way",
    ]);
    const supervisorSkills = await skillIdsByKeys([
      "intersections_traffic_lights",
      "car_control_pre_drive_check",
      "car_control_smooth_start_stop",
    ]);
    const union = new Set([...studentSkills, ...supervisorSkills]);
    assert.equal(union.size, 5);

    const results = await Promise.all([
      saveNextDrivePlan(journey.id, studentId, studentSkills),
      saveNextDrivePlan(journey.id, supervisor.userId, supervisorSkills),
    ]);
    assert.ok(results.every((result) => result.plan.skills.length >= 2));

    const active = await getPool().query(
      `SELECT skill_id, created_by_user_id
       FROM training_focus_items
       WHERE journey_id = $1 AND status = 'active'
       ORDER BY created_at`,
      [journey.id],
    );
    const activeSkillIds = active.rows.map((row) => String(row.skill_id)).sort();
    const writers = [...new Set(active.rows.map((row) => String(row.created_by_user_id)))];
    assert.ok(active.rows.length >= 2 && active.rows.length <= 3);
    assert.equal(writers.length, 1);
    assert.ok(
      [studentId, supervisor.userId].includes(writers[0]),
      "winner must be one of the two writers",
    );

    const studentSet = [...studentSkills].sort();
    const supervisorSet = [...supervisorSkills].sort();
    const matchesStudent =
      activeSkillIds.length === studentSet.length &&
      activeSkillIds.every((id, index) => id === studentSet[index]);
    const matchesSupervisor =
      activeSkillIds.length === supervisorSet.length &&
      activeSkillIds.every((id, index) => id === supervisorSet[index]);
    assert.equal(
      matchesStudent || matchesSupervisor,
      true,
      `active skills must be one save, not the union: ${activeSkillIds.join(",")}`,
    );
    assert.equal(activeSkillIds.some((id) => !union.has(id)), false);

    const plan = await getActiveNextDrivePlan(journey.id);
    assert.ok(plan);
    assert.equal(plan.skills.length, active.rows.length);
    assert.equal(plan.plannedByUserId, writers[0]);
    assert.equal(
      plan.plannedByName,
      writers[0] === studentId ? "Ella" : "Pappa",
    );
    assert.ok(plan.skills.every((skill) => union.has(skill.skillId)));
  });

  it("sets aria-current on the active tab", async () => {
    const { journey, userId } = await createJourneyForStudent("Ella");
    const app = await createTestApp();
    const home = await injectWithSession(app, session(userId), {
      method: "GET",
      url: `/journey/${journey.id}`,
    });
    assert.match(home.body, /href="\/resa" aria-current="page"/);

    const mer = await injectWithSession(app, session(userId), {
      method: "GET",
      url: "/mer",
    });
    assert.match(mer.body, /href="\/mer" aria-current="page"/);
    await app.close();
  });
});
