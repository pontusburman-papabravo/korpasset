import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { createAdminToken } from "../src/auth/admin.js";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { getPool } from "../src/db/pool.js";
import { createAdminUser } from "../src/services/admin-users.js";
import { getAdminProductStats } from "../src/services/admin-product-stats.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
  REFERRAL_SEEN_COOKIE,
  SHARE_TEXT,
  SHARE_TITLE,
  attributeReferralSignup,
  ensureReferralCode,
  isReferralCode,
  personalShareUrl,
  referralCookieValue,
  sharePayloadHasPersonalData,
  shareUrl,
} from "../src/services/share.js";
import { createGuestUser } from "../src/services/users.js";
import { APP_STORE_URL, PLAY_STORE_URL } from "../src/http/landing.js";
import { buildWeeklySummaryEmail } from "../src/services/weekly-summary-email.js";
import {
  WEEKLY_SUMMARY_TIME_ZONE,
  type JourneyWeeklySummary,
} from "../src/services/weekly-summary.js";
import { createTestApp } from "./helpers.js";
import { formBody } from "./http-helpers.js";
import { resetDatabaseData } from "./setup.js";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const FORBIDDEN = ["Värva en vän", "Bjud in och få", "Hjälp oss växa"];
const REFERRAL_CODE = `[${REFERRAL_CODE_ALPHABET}]{8}`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blankSummary(): JourneyWeeklySummary {
  return {
    journeyId: "00000000-0000-4000-8000-000000000001",
    timeZone: WEEKLY_SUMMARY_TIME_ZONE,
    weekKey: "2026-W40",
    start: "2026-09-27T22:00:00.000Z",
    end: "2026-10-04T22:00:00.000Z",
    completedDrives: 2,
    totalDriveSeconds: 1200,
    totalDriveMinutes: 20,
    trainedSkills: 1,
    uniqueTrainedSkills: 1,
    newlyTrainedSkills: 1,
    checkoffSteps: 1,
    completedSkills: 0,
    newlyCompletedSkills: 0,
    progressionStart: 10,
    progressionEnd: 12,
    supervisorsUsed: 1,
    distanceMeters: 1000,
    topSkills: [],
    firstDriveThisWeek: false,
  };
}

interface ShareEnv {
  native?: "ios" | "android";
  nativeResult?: "ok" | "cancel" | "missing";
  webShare?: "ok" | "cancel" | "fail" | "absent";
  userAgent?: string;
}

function loadShare(env: ShareEnv = {}) {
  const events: Array<{ event: string; surface: string; platform: string }> = [];
  const copied: string[] = [];
  const nativePayloads: Array<Record<string, string>> = [];
  const webPayloads: Array<Record<string, string>> = [];
  const navigator: {
    userAgent: string;
    clipboard: { writeText: (url: string) => Promise<void> };
    share?: (payload: Record<string, string>) => Promise<void>;
  } = {
    userAgent: env.userAgent ?? DESKTOP_UA,
    clipboard: {
      writeText: async (url: string) => {
        copied.push(url);
      },
    },
  };
  if (env.webShare !== "absent") {
    navigator.share = async (payload) => {
      webPayloads.push(payload);
      if (env.webShare === "cancel") {
        const error = new Error("Share canceled");
        error.name = "AbortError";
        throw error;
      }
      if (env.webShare === "fail") throw new Error("unsupported");
    };
  }
  const windowObj: Record<string, unknown> = {
    navigator,
    document: {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => undefined,
      createElement: () => ({
        style: {},
        setAttribute() {},
        select() {},
        remove() {},
      }),
      body: { appendChild() {} },
      execCommand: () => false,
    },
    fetch: async (_url: string, init?: { body?: string }) => {
      events.push(JSON.parse(init?.body ?? "{}"));
      return { ok: true };
    },
  };
  if (env.native && env.nativeResult !== "missing") {
    windowObj.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => env.native,
      Plugins: {
        Share: {
          share: async (payload: Record<string, string>) => {
            nativePayloads.push(payload);
            if (env.nativeResult === "cancel") {
              const error = new Error("Share canceled");
              error.name = "AbortError";
              throw error;
            }
            return { activityType: "com.apple.UIKit.activity.Message" };
          },
        },
      },
    };
  } else if (env.native && env.nativeResult === "missing") {
    windowObj.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => env.native,
      Plugins: {},
    };
  }
  const sandbox = { window: windowObj };
  const code = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../public/share.js"),
    "utf8",
  );
  runInContext(code, createContext(sandbox));
  return {
    api: windowObj.KorpassetShare as {
      chooseShareChannel: (input: { Capacitor?: unknown; webShare?: unknown }) => string;
      runShare: (node: ShareNode, mode?: string) => Promise<string>;
      bind: (node: ShareNode) => void;
    },
    events,
    copied,
    nativePayloads,
    webPayloads,
  };
}

interface ShareNode {
  attrs: Record<string, string | null>;
  feedback: { hidden: boolean; textContent: string };
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  querySelector: (selector: string) => { hidden: boolean; textContent: string } | null;
  querySelectorAll: (selector: string) => unknown[];
}

function shareNode(url: string, surface = "app"): ShareNode {
  const node: ShareNode = {
    attrs: {
      "data-share-surface": surface,
      "data-share-url": url,
      "data-share-title": SHARE_TITLE,
      "data-share-text": SHARE_TEXT,
      "data-share-bound": null,
      "data-share-silent-view": null,
    },
    feedback: { hidden: true, textContent: "" },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    querySelector() {
      return this.feedback;
    },
    querySelectorAll() {
      return [];
    },
  };
  return node;
}

function assertPayload(payload: Record<string, string>, url: string): void {
  assert.deepEqual(Object.keys(payload).sort(), ["text", "title", "url"]);
  assert.equal(payload.title, SHARE_TITLE);
  assert.equal(payload.text, SHARE_TEXT);
  assert.equal(payload.url, url);
  assert.equal(sharePayloadHasPersonalData(payload.text, payload.url), false);
}

describe("share helper", () => {
  const url = "http://localhost:3000/tips?ref=share_app";

  it("uses the Web Share API when it is available", async () => {
    const share = loadShare({ webShare: "ok" });
    assert.equal(
      share.api.chooseShareChannel({ webShare: () => undefined }),
      "web",
    );
    const result = await share.api.runShare(shareNode(url), "share");
    assert.equal(result, "completed");
    assert.equal(share.webPayloads.length, 1);
    assertPayload(share.webPayloads[0], url);
    assert.equal(share.copied.length, 0);
    assert.deepEqual(
      share.events.map((event) => event.event),
      ["share_started", "share_completed"],
    );
    assert.equal(share.events[0].surface, "app");
    assert.equal(share.events[0].platform, "web");
  });

  it("copies the canonical URL when Web Share is missing", async () => {
    const share = loadShare({ webShare: "absent" });
    assert.equal(share.api.chooseShareChannel({}), "copy");
    const node = shareNode(url);
    const result = await share.api.runShare(node, "share");
    assert.equal(result, "copied");
    assert.deepEqual(share.copied, [url]);
    assert.equal(node.feedback.textContent, "Länken är kopierad");
    assert.equal(node.feedback.hidden, false);
    assert.deepEqual(
      share.events.map((event) => event.event),
      ["share_started", "share_link_copied"],
    );
  });

  it("opens the native share sheet on iOS and Android", async () => {
    for (const platform of ["ios", "android"] as const) {
      const share = loadShare({ native: platform, nativeResult: "ok", webShare: "ok" });
      const cap = {
        isNativePlatform: () => true,
        Plugins: { Share: { share: async () => undefined } },
      };
      assert.equal(share.api.chooseShareChannel({ Capacitor: cap, webShare: () => undefined }), "native");
      const result = await share.api.runShare(shareNode(url), "share");
      assert.equal(result, "completed");
      assert.equal(share.nativePayloads.length, 1);
      assertPayload(share.nativePayloads[0], url);
      assert.equal(share.webPayloads.length, 0);
      assert.equal(share.copied.length, 0);
      assert.equal(share.events.at(-1)?.event, "share_completed");
      assert.equal(share.events.at(-1)?.platform, platform);
    }
  });

  it("does not copy or complete a cancelled share", async () => {
    const share = loadShare({ native: "ios", nativeResult: "cancel", webShare: "ok" });
    const result = await share.api.runShare(shareNode(url), "share");
    assert.equal(result, "cancelled");
    assert.equal(share.copied.length, 0);
    assert.equal(share.webPayloads.length, 0);
    assert.deepEqual(share.events.map((event) => event.event), ["share_started"]);
  });

  it("falls through to Web Share when the native plugin is missing", async () => {
    const share = loadShare({ native: "android", nativeResult: "missing", webShare: "ok" });
    const result = await share.api.runShare(shareNode(url), "share");
    assert.equal(result, "completed");
    assert.equal(share.nativePayloads.length, 0);
    assert.equal(share.webPayloads.length, 1);
  });

  it("counts a prompt once", () => {
    const share = loadShare({ webShare: "absent" });
    const node = shareNode(url, "website");
    share.api.bind(node);
    share.api.bind(node);
    assert.equal(share.events.filter((event) => event.event === "share_prompt_viewed").length, 1);
    assert.equal(share.events[0].surface, "website");
  });

  it("keeps personal data out of the shared text and URL", () => {
    for (const surface of ["app", "website", "weekly_email"] as const) {
      const url = shareUrl(surface, "https://korpasset.se");
      assert.equal(sharePayloadHasPersonalData(SHARE_TEXT, url), false);
      assert.match(url, new RegExp(`/tips\\?source=${surface}$`));
      const personal = `https://korpasset.se/tips?r=AB7K29CD&source=${surface}`;
      assert.equal(sharePayloadHasPersonalData(SHARE_TEXT, personal), false);
    }
    assert.equal(
      sharePayloadHasPersonalData(SHARE_TEXT, "https://korpasset.se/tips?ref=share_app&email=a@b.se"),
      true,
    );
    assert.equal(
      sharePayloadHasPersonalData(SHARE_TEXT, "https://korpasset.se/tips?user_id=123"),
      true,
    );
    assert.equal(
      sharePayloadHasPersonalData(
        SHARE_TEXT,
        "https://korpasset.se/tips?r=11111111-1111-4111-8111-111111111111&source=app",
      ),
      true,
    );
    assert.equal(
      sharePayloadHasPersonalData("Hör av dig till elev@example.com", shareUrl("app")),
      true,
    );
    assert.equal(sharePayloadHasPersonalData(SHARE_TEXT, "https://korpasset.se/app?ref=share_app"), true);
  });
});

describe("share surfaces", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("links the weekly email to the tips page after the product CTA", () => {
    const email = buildWeeklySummaryEmail({
      displayName: "Ella Hemlig",
      summary: blankSummary(),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl: "https://korpasset.se/tips?ref=share_weekly_email",
    });
    const openAt = email.text.indexOf("Öppna Körpasset:");
    const shareAt = email.text.indexOf("Gillar du Körpasset?");
    const closeAt = email.text.indexOf("Vi hörs nästa söndag.");
    assert.ok(openAt >= 0 && shareAt > openAt && closeAt > shareAt);
    const block = email.text.slice(shareAt, closeAt);
    assert.match(block, /Känner du någon som också övningskör\? Tipsa gärna om Körpasset\./);
    assert.match(block, /Tipsa en vän: https:\/\/korpasset\.se\/tips\?ref=share_weekly_email/);
    assert.doesNotMatch(block, /Ella|Hemlig|körpass den|%|handledare/);
    assert.equal(
      sharePayloadHasPersonalData(SHARE_TEXT, "https://korpasset.se/tips?ref=share_weekly_email"),
      false,
    );
    assert.match(
      email.html,
      /<a href="https:\/\/korpasset\.se\/tips\?ref=share_weekly_email">Tipsa en vän<\/a>/,
    );
    assert.doesNotMatch(email.html, /apps\.apple\.com|play\.google\.com/);
    for (const phrase of FORBIDDEN) assert.equal(email.text.includes(phrase), false);
  });

  it("serves a tips page for iPhone, Android and desktop", async () => {
    const app = await createTestApp();
    const cases = [
      { ua: IPHONE_UA, platform: "ios" },
      { ua: ANDROID_UA, platform: "android" },
      { ua: DESKTOP_UA, platform: "web" },
    ];
    for (const item of cases) {
      const page = await app.inject({
        method: "GET",
        url: "/tips?ref=share_weekly_email",
        headers: { "user-agent": item.ua },
      });
      assert.equal(page.statusCode, 200);
      assert.match(page.body, new RegExp(`data-platform="${item.platform}"`));
      assert.match(page.body, new RegExp(`id="tips-app-store" href="${escapeRegExp(APP_STORE_URL)}"`));
      assert.match(page.body, new RegExp(`id="tips-play-store" href="${escapeRegExp(PLAY_STORE_URL)}"`));
      assert.match(page.body, /Google Play är inte öppet för alla än/);
      assert.match(page.body, /href="\/#android"/);
      assert.match(page.body, /id="tips-open-app" href="\/app"/);
      assert.match(page.body, /data-share-url="[^"]*\/tips\?source=website"/);
      assert.match(page.body, /data-share-silent-view="1"/);
      assert.match(page.body, />Dela</);
      assert.match(page.body, />Kopiera länk</);
      assert.match(page.body, /src="\/share\.js"/);
      assert.equal(page.cookies.find((entry) => entry.name === REFERRAL_COOKIE), undefined);
      for (const phrase of FORBIDDEN) assert.equal(page.body.includes(phrase), false);
    }
    const rows = await getPool().query(
      `SELECT count(*)::int AS n FROM product_events WHERE event_name = 'share_landing_viewed'`,
    );
    assert.equal(rows.rows[0].n, 0);
    await app.close();
  });

  it("shows the website prompt and a permanent app prompt", async () => {
    const student = await createJourneyForStudent("Ella Hemlig");
    const app = await createTestApp();
    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Övningskör ni redan med Körpasset\?/);
    assert.match(home.body, /Tipsa gärna någon annan som snart ska börja\./);
    assert.match(home.body, />Tipsa en vän</);
    assert.match(home.body, /data-share-surface="website"/);
    assert.match(home.body, /data-share-url="[^"]*\/tips\?source=website"/);
    assert.match(home.body, new RegExp(`data-share-text="${escapeRegExp(SHARE_TEXT)}"`));
    assert.doesNotMatch(home.body, /data-share-url="[^"]*(Ella|Hemlig|email=)/);
    assert.match(home.body, /src="\/share\.js"/);

    const account = await app.inject({
      method: "GET",
      url: "/konto",
      cookies: { [config.sessionCookieName]: createSessionToken(student.userId) },
    });
    assert.equal(account.statusCode, 200);
    assert.match(account.body, /Gillar du Körpasset\?/);
    assert.match(account.body, /Tipsa någon som också övningskör\./);
    assert.match(account.body, /data-share-surface="app"/);
    assert.match(
      account.body,
      new RegExp(`data-share-url="[^"]*/tips\\?r=${REFERRAL_CODE}&amp;source=app"`),
    );
    assert.equal(account.body.includes(student.userId), false);
    assert.doesNotMatch(account.body, /data-share-text="[^"]*Ella/);
    for (const phrase of FORBIDDEN) {
      assert.equal(home.body.includes(phrase), false);
      assert.equal(account.body.includes(phrase), false);
    }
    await app.close();
  });

  it("keeps the share prompt secondary after a finished drive", async () => {
    const student = await createJourneyForStudent("Ella Hemlig");
    const inserted = await getPool().query(
      `INSERT INTO drives (journey_id, started_by_user_id, supervisor_user_id, started_at, ended_at)
       VALUES ($1, $2, $2, now(), now())
       RETURNING id`,
      [student.journey.id, student.userId],
    );
    const app = await createTestApp();
    const page = await app.inject({
      method: "GET",
      url: `/journey/${student.journey.id}/drive/${inserted.rows[0].id}/done`,
      cookies: { [config.sessionCookieName]: createSessionToken(student.userId) },
    });
    assert.equal(page.statusCode, 200);
    const back = page.body.indexOf("Tillbaka till resan");
    const share = page.body.indexOf("share-prompt--quiet");
    assert.ok(back > 0 && share > back);
    assert.match(page.body, /class="btn btn-primary"[^>]*>Tillbaka till resan/);
    assert.match(page.body, /data-share-surface="app"/);
    assert.match(
      page.body,
      new RegExp(`data-share-url="[^"]*/tips\\?r=${REFERRAL_CODE}&amp;source=app"`),
    );
    assert.doesNotMatch(page.body, /role="dialog"|share-modal/);
    assert.doesNotMatch(page.body, /data-share-url="[^"]*Ella/);
    await app.close();
  });

  it("records share events with surface and attributes a registration", async () => {
    const app = await createTestApp();
    const rejected = await app.inject({
      method: "POST",
      url: "/api/share",
      headers: { "content-type": "application/json" },
      payload: { event: "share_started", surface: "friend", platform: "ios" },
    });
    assert.equal(rejected.statusCode, 400);

    const started = await createJourneyForStudent("Ella Hemlig");
    const tracked = await app.inject({
      method: "POST",
      url: "/api/share",
      headers: { "content-type": "application/json", "user-agent": IPHONE_UA },
      cookies: {
        [config.sessionCookieName]: createSessionToken(started.userId),
        korpasset_active_journey: started.journey.id,
      },
      payload: { event: "share_started", surface: "app", platform: "ios" },
    });
    assert.equal(tracked.statusCode, 204);

    const created = await app.inject({
      method: "POST",
      url: "/start",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": ANDROID_UA,
      },
      payload: formBody({ name: "Nova Hemlig" }),
    });
    assert.equal(created.statusCode, 302);

    const interest = await app.inject({
      method: "POST",
      url: "/interest",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": DESKTOP_UA,
      },
      payload: formBody({
        name: "Anna Andersson",
        email: "anna.tips@example.com",
        role: "parent",
        platform_android: "yes",
        consent: "yes",
      }),
    });
    assert.equal(interest.statusCode, 302);

    const events = await getPool().query(
      `SELECT event_name, share_surface, client_platform, user_id, journey_id, actor_role,
              referrer_user_id, row_to_json(product_events)::text AS raw
       FROM product_events
       WHERE event_name LIKE 'share_%'
       ORDER BY created_at`,
    );
    const names = events.rows.map((row) => `${row.event_name}:${row.share_surface}:${row.client_platform}`);
    assert.ok(names.includes("share_started:app:ios"));
    assert.equal(names.some((name) => name.startsWith("share_registration")), false);
    const button = events.rows.find((row) => row.event_name === "share_started");
    assert.equal(button.user_id, started.userId);
    assert.equal(button.referrer_user_id, started.userId);
    assert.equal(button.journey_id, started.journey.id);
    assert.equal(button.actor_role, "student");
    for (const row of events.rows) {
      assert.equal(String(row.raw).includes("anna.tips@example.com"), false);
      assert.equal(String(row.raw).includes("Nova Hemlig"), false);
      assert.equal(String(row.raw).includes("Ella Hemlig"), false);
    }

    const stats = await getAdminProductStats("30");
    assert.equal(stats.tips.windows.all.uniqueSharers, 1);
    assert.equal(stats.tips.windows.all.shareStarts, 1);
    assert.equal(stats.tips.windows.all.signups, 0);
    assert.equal(stats.tips.windows.all.visits, 0);
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const page = await app.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /data-tips-stats/);
    assert.match(page.body, /Tips &amp; delningar/);
    assert.match(
      page.body,
      /Delningsknappen använd<\/td>\s*<td>1<\/td>\s*<td>1<\/td>\s*<td>1<\/td>/,
    );
    assert.match(
      page.body,
      /Registrering via tips<\/td>\s*<td>0<\/td>\s*<td>0<\/td>\s*<td>0<\/td>/,
    );
    await app.close();
  });
});

describe("referral attribution", () => {
  beforeEach(async () => {
    await resetDatabaseData();
  });

  it("gives a logged-in user a stable code that hides the account id", async () => {
    const student = await createJourneyForStudent("Anna Andersson");
    const first = await ensureReferralCode(student.userId);
    const second = await ensureReferralCode(student.userId);
    assert.equal(first, second);
    assert.equal(isReferralCode(first), true);
    assert.equal(first.includes(student.userId), false);
    assert.equal(first.includes(student.userId.replaceAll("-", "")), false);
    const url = await personalShareUrl(student.userId, "app", "https://korpasset.se");
    assert.match(url, new RegExp(`/tips\\?r=${first}&source=app$`));
    assert.equal(sharePayloadHasPersonalData(SHARE_TEXT, url), false);
    assert.equal(url.includes(student.userId), false);
    assert.equal(url.includes("Anna"), false);
  });

  it("ties the weekly email link to the student and records one visit", async () => {
    const student = await createJourneyForStudent("Anna Andersson");
    const url = await personalShareUrl(student.userId, "weekly_email", "https://korpasset.se");
    const code = url.match(new RegExp(`r=(${REFERRAL_CODE})`))?.[1];
    assert.ok(code);
    assert.equal(url.includes(student.userId), false);
    const email = buildWeeklySummaryEmail({
      displayName: "Anna Andersson",
      summary: blankSummary(),
      previous: null,
      appUrl: "https://korpasset.se/app",
      shareUrl: url,
    });
    assert.match(email.text, new RegExp(escapeRegExp(url)));
    assert.doesNotMatch(email.text, new RegExp(student.userId));
    assert.equal(sharePayloadHasPersonalData(SHARE_TEXT, url), false);

    const app = await createTestApp();
    const first = await app.inject({
      method: "GET",
      url: `/tips?r=${code}&source=weekly_email`,
      headers: { "user-agent": DESKTOP_UA },
    });
    assert.equal(first.statusCode, 200);
    assert.doesNotMatch(first.body, /Anna/);
    assert.match(first.body, /data-share-url="[^"]*\/tips\?source=website"/);
    const referral = first.cookies.find((entry) => entry.name === REFERRAL_COOKIE);
    const seen = first.cookies.find((entry) => entry.name === REFERRAL_SEEN_COOKIE);
    assert.equal(referral?.httpOnly, true);
    assert.equal(referral?.maxAge, REFERRAL_MAX_AGE_SECONDS);
    assert.match(referral?.value ?? "", new RegExp(`^${code}\\.weekly_email\\.\\d+$`));
    assert.equal(seen?.value, code);
    assert.equal(seen?.maxAge, undefined);

    const reload = await app.inject({
      method: "GET",
      url: `/tips?r=${code}&source=weekly_email`,
      headers: { "user-agent": DESKTOP_UA },
      cookies: {
        [REFERRAL_COOKIE]: referral?.value ?? "",
        [REFERRAL_SEEN_COOKIE]: seen?.value ?? "",
      },
    });
    assert.equal(reload.statusCode, 200);
    const visits = await getPool().query(
      `SELECT user_id, referrer_user_id, share_surface
       FROM product_events
       WHERE event_name = 'share_landing_viewed'`,
    );
    assert.equal(visits.rowCount, 1);
    assert.equal(visits.rows[0].user_id, null);
    assert.equal(visits.rows[0].referrer_user_id, student.userId);
    assert.equal(visits.rows[0].share_surface, "weekly_email");
    await app.close();
  });

  it("attributes a signup to the first referrer only", async () => {
    const anna = await createJourneyForStudent("Anna Andersson");
    const erik = await createJourneyForStudent("Erik Svensson");
    const annaCode = await ensureReferralCode(anna.userId);
    const erikCode = await ensureReferralCode(erik.userId);
    const app = await createTestApp();
    const first = await app.inject({
      method: "GET",
      url: `/tips?r=${annaCode}&source=weekly_email`,
    });
    const annaCookie = first.cookies.find((entry) => entry.name === REFERRAL_COOKIE)?.value;
    assert.ok(annaCookie);
    const second = await app.inject({
      method: "GET",
      url: `/tips?r=${erikCode}&source=app`,
      cookies: {
        [REFERRAL_COOKIE]: annaCookie,
        [REFERRAL_SEEN_COOKIE]: annaCode,
      },
    });
    assert.equal(
      second.cookies.find((entry) => entry.name === REFERRAL_COOKIE),
      undefined,
    );
    const created = await app.inject({
      method: "POST",
      url: "/start",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": ANDROID_UA,
      },
      cookies: { [REFERRAL_COOKIE]: annaCookie },
      payload: formBody({ name: "Nova Hemlig" }),
    });
    assert.equal(created.statusCode, 302);
    const user = await getPool().query(
      `SELECT id, referred_by_user_id, referred_by_code
       FROM users WHERE display_name = 'Nova Hemlig'`,
    );
    assert.equal(user.rows[0].referred_by_user_id, anna.userId);
    assert.equal(user.rows[0].referred_by_code, annaCode);
    const again = await attributeReferralSignup({
      newUserId: user.rows[0].id,
      cookieValue: referralCookieValue(erikCode, "app"),
      platform: "web",
    });
    assert.equal(again, false);
    const still = await getPool().query(
      `SELECT referred_by_user_id FROM users WHERE id = $1`,
      [user.rows[0].id],
    );
    assert.equal(still.rows[0].referred_by_user_id, anna.userId);
    const regs = await getPool().query(
      `SELECT user_id, referrer_user_id, share_surface
       FROM product_events WHERE event_name = 'share_registration'`,
    );
    assert.equal(regs.rowCount, 1);
    assert.equal(regs.rows[0].user_id, user.rows[0].id);
    assert.equal(regs.rows[0].referrer_user_id, anna.userId);
    assert.equal(regs.rows[0].share_surface, "weekly_email");

    const existing = await createGuestUser("Befintlig");
    const skipped = await app.inject({
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      cookies: {
        [config.sessionCookieName]: createSessionToken(existing.id),
        [REFERRAL_COOKIE]: referralCookieValue(erikCode, "website"),
      },
      payload: formBody({ name: "Befintlig" }),
    });
    assert.equal(skipped.statusCode, 302);
    const existingRow = await getPool().query(
      `SELECT referred_by_user_id FROM users WHERE id = $1`,
      [existing.id],
    );
    assert.equal(existingRow.rows[0].referred_by_user_id, null);
    await app.close();
  });

  it("ignores an invalid or deleted referral code and a self visit", async () => {
    const student = await createJourneyForStudent("Anna Andersson");
    const code = await ensureReferralCode(student.userId);
    const app = await createTestApp();
    const invalid = await app.inject({
      method: "GET",
      url: `/tips?r=${student.userId}&source=app`,
    });
    assert.equal(invalid.statusCode, 200);
    assert.equal(invalid.cookies.find((entry) => entry.name === REFERRAL_COOKIE), undefined);
    const unknown = await app.inject({
      method: "GET",
      url: "/tips?r=AB7K29CD&source=website",
    });
    assert.equal(unknown.statusCode, 200);
    assert.equal(unknown.cookies.find((entry) => entry.name === REFERRAL_COOKIE), undefined);

    const self = await app.inject({
      method: "GET",
      url: `/tips?r=${code}&source=weekly_email`,
      cookies: { [config.sessionCookieName]: createSessionToken(student.userId) },
    });
    assert.equal(self.statusCode, 200);
    assert.equal(self.cookies.find((entry) => entry.name === REFERRAL_COOKIE), undefined);
    assert.match(
      self.body,
      new RegExp(`data-share-url="[^"]*/tips\\?r=${code}&amp;source=website"`),
    );

    await getPool().query(`UPDATE users SET account_state = 'deleted' WHERE id = $1`, [
      student.userId,
    ]);
    const deleted = await app.inject({
      method: "GET",
      url: `/tips?r=${code}&source=app`,
    });
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.cookies.find((entry) => entry.name === REFERRAL_COOKIE), undefined);
    const visits = await getPool().query(
      `SELECT count(*)::int AS n FROM product_events WHERE event_name = 'share_landing_viewed'`,
    );
    assert.equal(visits.rows[0].n, 0);
    const signup = await attributeReferralSignup({
      newUserId: (await createGuestUser("Nova")).id,
      cookieValue: referralCookieValue(code, "app"),
      platform: "web",
    });
    assert.equal(signup, false);
    await app.close();
  });

  it("shows unique referrers and referral signups in admin", async () => {
    const anna = await createJourneyForStudent("Anna Andersson");
    const erik = await createGuestUser("Erik Svensson");
    await getPool().query(
      `INSERT INTO journey_collaborators (journey_id, user_id, role, status)
       VALUES ($1, $2, 'supervisor', 'active')`,
      [anna.journey.id, erik.id],
    );
    const annaCode = await ensureReferralCode(anna.userId);
    const app = await createTestApp();
    const share = async (
      userId: string,
      journeyId: string,
      surface: string,
    ) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/share",
        headers: { "content-type": "application/json", "user-agent": DESKTOP_UA },
        cookies: {
          [config.sessionCookieName]: createSessionToken(userId),
          korpasset_active_journey: journeyId,
        },
        payload: { event: "share_started", surface, platform: "web" },
      });
      assert.equal(response.statusCode, 204);
    };
    await share(anna.userId, anna.journey.id, "app");
    await share(anna.userId, anna.journey.id, "app");
    await app.inject({
      method: "POST",
      url: "/api/share",
      headers: { "content-type": "application/json" },
      cookies: {
        [config.sessionCookieName]: createSessionToken(anna.userId),
        korpasset_active_journey: anna.journey.id,
      },
      payload: { event: "share_link_copied", surface: "app", platform: "web" },
    });
    await share(erik.id, anna.journey.id, "website");

    const visit = await app.inject({
      method: "GET",
      url: `/tips?r=${annaCode}&source=app`,
    });
    const cookie = visit.cookies.find((entry) => entry.name === REFERRAL_COOKIE)?.value;
    const created = await app.inject({
      method: "POST",
      url: "/start",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      cookies: { [REFERRAL_COOKIE]: cookie ?? "" },
      payload: formBody({ name: "Nova Hemlig" }),
    });
    assert.equal(created.statusCode, 302);

    const stats = await getAdminProductStats("30");
    assert.equal(stats.tips.windows.all.uniqueSharers, 2);
    assert.equal(stats.tips.windows.all.shareStarts, 3);
    assert.equal(stats.tips.windows.all.linksCopied, 1);
    assert.equal(stats.tips.windows.all.visits, 1);
    assert.equal(stats.tips.windows.all.signups, 1);
    assert.equal(stats.tips.rows.length, 2);
    assert.equal(stats.tips.rows[0]?.displayName, "Anna Andersson");
    assert.equal(stats.tips.rows[0]?.role, "student");
    assert.equal(stats.tips.rows[0]?.shares, 2);
    assert.equal(stats.tips.rows[0]?.visits, 1);
    assert.equal(stats.tips.rows[0]?.signups, 1);
    assert.equal(stats.tips.rows[0]?.journeyId, anna.journey.id);
    assert.deepEqual(stats.tips.rows[0]?.surfaces, ["app"]);
    assert.equal(stats.tips.rows[1]?.displayName, "Erik Svensson");
    assert.equal(stats.tips.rows[1]?.role, "supervisor");
    assert.equal(stats.tips.rows[1]?.shares, 1);
    assert.equal(stats.tips.rows[1]?.signups, 0);

    const signupFilter = await getAdminProductStats("30", "signup");
    assert.equal(signupFilter.tips.rows.length, 1);
    assert.equal(signupFilter.tips.rows[0]?.displayName, "Anna Andersson");
    const students = await getAdminProductStats("30", "student");
    assert.deepEqual(students.tips.rows.map((row) => row.displayName), ["Anna Andersson"]);
    const supervisors = await getAdminProductStats("30", "supervisor");
    assert.deepEqual(supervisors.tips.rows.map((row) => row.displayName), ["Erik Svensson"]);
    const website = await getAdminProductStats("30", "website");
    assert.deepEqual(website.tips.rows.map((row) => row.displayName), ["Erik Svensson"]);

    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const page = await app.inject({
      method: "GET",
      url: "/admin/statistik?tips=all",
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(page.statusCode, 200);
    assert.match(
      page.body,
      /Unika användare som tipsat<\/td>\s*<td>2<\/td>\s*<td>2<\/td>\s*<td>2<\/td>/,
    );
    assert.match(
      page.body,
      /Registrering via tips<\/td>\s*<td>1<\/td>\s*<td>1<\/td>\s*<td>1<\/td>/,
    );
    assert.match(
      page.body,
      new RegExp(`href="/admin/statistik/resa/${anna.journey.id}"[^>]*>Anna Andersson`),
    );
    assert.match(page.body, new RegExp(`href="/admin/users/${erik.id}"[^>]*>Erik Svensson`));
    assert.match(page.body, /Minst 1 registrering från tips/);
    assert.match(page.body, />Elev</);
    await app.close();
  });
});
