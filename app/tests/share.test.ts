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
  SHARE_TEXT,
  SHARE_TITLE,
  sharePayloadHasPersonalData,
  shareUrl,
} from "../src/services/share.js";
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
      assert.match(url, new RegExp(`/tips\\?ref=share_${surface}$`));
    }
    assert.equal(
      sharePayloadHasPersonalData(SHARE_TEXT, "https://korpasset.se/tips?ref=share_app&email=a@b.se"),
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
      assert.match(page.body, /data-share-url="[^"]*\/tips\?ref=share_weekly_email"/);
      assert.match(page.body, /data-share-silent-view="1"/);
      assert.match(page.body, />Dela</);
      assert.match(page.body, />Kopiera länk</);
      assert.match(page.body, /src="\/share\.js"/);
      const cookie = page.cookies.find((entry) => entry.name === "korpasset_share_ref");
      assert.equal(cookie?.value, "share_weekly_email");
      assert.equal(cookie?.httpOnly, true);
      for (const phrase of FORBIDDEN) assert.equal(page.body.includes(phrase), false);
    }
    const rows = await getPool().query(
      `SELECT share_surface, client_platform FROM product_events WHERE event_name = 'share_landing_viewed' ORDER BY client_platform`,
    );
    assert.deepEqual(
      rows.rows.map((row) => [row.share_surface, row.client_platform]),
      [
        ["weekly_email", "android"],
        ["weekly_email", "ios"],
        ["weekly_email", "web"],
      ],
    );
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
    assert.match(home.body, /data-share-url="[^"]*\/tips\?ref=share_website"/);
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
    assert.match(account.body, /data-share-url="[^"]*\/tips\?ref=share_app"/);
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
      cookies: { korpasset_share_ref: "share_weekly_email" },
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
      cookies: { korpasset_share_ref: "share_website" },
      payload: formBody({
        name: "Anna Andersson",
        email: "anna.tips@example.com",
        role: "parent",
        platform_android: "yes",
        consent: "yes",
      }),
    });
    assert.equal(interest.statusCode, 302);
    const again = await app.inject({
      method: "POST",
      url: "/interest",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      cookies: { korpasset_share_ref: "share_website" },
      payload: formBody({
        name: "Anna Andersson",
        email: "anna.tips@example.com",
        role: "parent",
        platform_android: "yes",
        consent: "yes",
      }),
    });
    assert.equal(again.statusCode, 302);

    const events = await getPool().query(
      `SELECT event_name, share_surface, client_platform, user_id, journey_id, actor_role,
              row_to_json(product_events)::text AS raw
       FROM product_events
       WHERE event_name LIKE 'share_%'
       ORDER BY created_at`,
    );
    const names = events.rows.map((row) => `${row.event_name}:${row.share_surface}:${row.client_platform}`);
    assert.ok(names.includes("share_started:app:ios"));
    assert.ok(names.includes("share_registration:weekly_email:android"));
    assert.ok(names.includes("share_registration:website:web"));
    assert.equal(names.filter((name) => name.startsWith("share_registration:website")).length, 1);
    const button = events.rows.find((row) => row.event_name === "share_started");
    assert.equal(button.user_id, started.userId);
    assert.equal(button.journey_id, started.journey.id);
    assert.equal(button.actor_role, "student");
    const signup = events.rows.find(
      (row) => row.event_name === "share_registration" && row.share_surface === "website",
    );
    assert.equal(signup.user_id, null);
    assert.equal(signup.journey_id, null);
    for (const row of events.rows) {
      assert.equal(String(row.raw).includes("anna.tips@example.com"), false);
      assert.equal(String(row.raw).includes("Nova Hemlig"), false);
      assert.equal(String(row.raw).includes("Ella Hemlig"), false);
    }

    const landing = await app.inject({
      method: "GET",
      url: "/tips?ref=share_app",
      headers: { "user-agent": IPHONE_UA },
    });
    assert.equal(landing.statusCode, 200);

    const stats = await getAdminProductStats("30");
    assert.equal(stats.share.started, 1);
    assert.equal(stats.share.registrations, 2);
    assert.equal(stats.share.landingViews, 1);
    const admin = await createAdminUser("ops@korpasset.se", "korrekt-losen-12");
    const page = await app.inject({
      method: "GET",
      url: "/admin/statistik",
      cookies: { korpasset_admin: createAdminToken(admin.id) },
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /data-share-stats/);
    assert.match(page.body, /Delningsknappar<\/p>\s*<p class="admin-kpi__value">1<\/p>/);
    assert.match(page.body, /Registreringar via delning<\/p>\s*<p class="admin-kpi__value">2<\/p>/);
    assert.match(page.body, /Besök via delning/);
    await app.close();
  });
});
