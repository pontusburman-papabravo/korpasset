import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { createInvitation } from "../src/services/invitations.js";
import { createJourneyForStudent } from "../src/services/journeys.js";
import { createTestApp } from "./helpers.js";
import { resetDatabaseData } from "./setup.js";

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../public/app-oauth.js"),
  "utf8",
);

type DeeplinkApi = {
  PENDING_KEY: string;
  parseInviteUrl: (url: string) => { token: string; destination: string } | null;
  shouldNavigateToPending: (path: string, token: string) => boolean;
  savePending: (token: string, store?: StorageLike) => boolean;
  readPending: (store?: StorageLike) => string | null;
  clearPending: (store?: StorageLike) => void;
  consumeIncomingUrl: (
    rawUrl: string,
    eventType: string,
    ctx?: HandlerCtx,
  ) => HandlerResult;
  consumePendingIfNeeded: (eventType: string, ctx?: HandlerCtx) => HandlerResult;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type HandlerCtx = {
  currentPath?: string;
  currentUrl?: string;
  storage?: StorageLike;
  assign?: (url: string) => void;
};

type HandlerResult = {
  rawUrl: string;
  eventType: string;
  token: string | null;
  currentUrl: string;
  destinationUrl: string | null;
  pendingSaved: boolean;
  earlyReturn: string | null;
  error: string | null;
};

function memoryStore(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function loadNative(options: {
  pathname?: string;
  launchUrl?: string;
  pending?: string;
} = {}) {
  const assigns: string[] = [];
  const store = memoryStore();
  if (options.pending) store.setItem("korpasset.pendingInvite", options.pending);
  const listeners: Record<string, (event: { url: string }) => void> = {};
  const pathname = options.pathname ?? "/app";
  const windowObj: Record<string, unknown> = {
    location: {
      pathname,
      search: "",
      href: `https://korpasset.se${pathname}`,
      assign(url: string) {
        assigns.push(url);
      },
    },
    sessionStorage: store,
    Capacitor: {
      getPlatform: () => "ios",
      isNativePlatform: () => true,
      Plugins: {
        App: {
          addListener(name: string, fn: (event: { url: string }) => void) {
            listeners[name] = fn;
            return { remove() {} };
          },
          async getLaunchUrl() {
            return options.launchUrl ? { url: options.launchUrl } : undefined;
          },
        },
      },
    },
  };
  const sandbox: Record<string, unknown> = {
    URL,
    console,
    document: {
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      createElement() {
        return {
          className: "",
          hidden: false,
          textContent: "",
          setAttribute() {},
          appendChild() {},
        };
      },
      addEventListener() {},
      body: null,
    },
    window: windowObj,
  };
  runInContext(script, createContext(sandbox));
  return {
    assigns,
    store,
    listeners,
    deeplink: windowObj.KORPASSET_DEEPLINK as DeeplinkApi,
    async flush() {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function apiOnly() {
  return loadNative({ pathname: "/konto" }).deeplink;
}

describe("native invite deep-link handoff", () => {
  it("parses the Safari button URL korpasset://invite/<token>", () => {
    const deeplink = apiOnly();
    for (const url of [
      "korpasset://invite/abc_DEF-123",
      "https://korpasset.se/invite/abc_DEF-123",
      "https://www.korpasset.se/invite/abc_DEF-123/",
      "korpasset:///invite/abc_DEF-123",
    ]) {
      const parsed = deeplink.parseInviteUrl(url);
      assert.equal(parsed?.token, "abc_DEF-123", url);
      assert.equal(parsed?.destination, "/invite/abc_DEF-123", url);
    }
  });

  it("rejects invalid invite URLs and foreign hosts", () => {
    const deeplink = apiOnly();
    assert.equal(deeplink.parseInviteUrl("korpasset://invite/not a token"), null);
    assert.equal(deeplink.parseInviteUrl("korpasset://oauth/callback"), null);
    assert.equal(deeplink.parseInviteUrl("https://evil.example/invite/abc"), null);
    assert.equal(deeplink.parseInviteUrl("https://korpasset.se/app"), null);
    assert.equal(deeplink.parseInviteUrl(""), null);
  });

  it("handles a cold start via getLaunchUrl before /app can win", async () => {
    const page = loadNative({
      pathname: "/app",
      launchUrl: "korpasset://invite/coldToken",
    });
    await page.flush();
    assert.deepEqual(page.assigns, ["/invite/coldToken"]);
    assert.equal(page.store.getItem("korpasset.pendingInvite"), "coldToken");
    const debug = JSON.parse(page.store.getItem("korpasset.deeplinkDebug") || "{}") as HandlerResult;
    assert.equal(debug.eventType, "cold start");
    assert.equal(debug.rawUrl, "korpasset://invite/coldToken");
    assert.equal(debug.token, "coldToken");
    assert.equal(debug.currentUrl, "https://korpasset.se/app");
    assert.equal(debug.destinationUrl, "/invite/coldToken");
    assert.equal(debug.pendingSaved, true);
    assert.equal(debug.earlyReturn, null);
  });

  it("handles appUrlOpen when the app is already running", async () => {
    const page = loadNative({ pathname: "/app" });
    await page.flush();
    assert.deepEqual(page.assigns, []);
    page.listeners.appUrlOpen({ url: "korpasset://invite/warmToken" });
    assert.deepEqual(page.assigns, ["/invite/warmToken"]);
    assert.equal(page.store.getItem("korpasset.pendingInvite"), "warmToken");
    const debug = JSON.parse(page.store.getItem("korpasset.deeplinkDebug") || "{}") as HandlerResult;
    assert.equal(debug.eventType, "appUrlOpen");
    assert.equal(debug.token, "warmToken");
  });

  it("keeps a pending invite across a generic /app startup", async () => {
    const deeplink = apiOnly();
    const store = memoryStore();
    const assigns: string[] = [];
    const first = deeplink.consumeIncomingUrl("korpasset://invite/keepMe", "appUrlOpen", {
      currentPath: "/app",
      currentUrl: "https://korpasset.se/app",
      storage: store,
      assign(url) {
        assigns.push(url);
      },
    });
    assert.equal(first.pendingSaved, true);
    assert.deepEqual(assigns, ["/invite/keepMe"]);

    const overwrittenByApp = deeplink.consumePendingIfNeeded("pending", {
      currentPath: "/app",
      currentUrl: "https://korpasset.se/app",
      storage: store,
      assign(url) {
        assigns.push(url);
      },
    });
    assert.equal(overwrittenByApp.token, "keepMe");
    assert.equal(overwrittenByApp.pendingSaved, true);
    assert.deepEqual(assigns, ["/invite/keepMe", "/invite/keepMe"]);
    assert.equal(deeplink.shouldNavigateToPending("/app", "keepMe"), true);
    assert.equal(deeplink.shouldNavigateToPending("/invite/keepMe", "keepMe"), false);
  });

  it("does not steal a normal /app start when no invite is pending", async () => {
    const page = loadNative({ pathname: "/app" });
    await page.flush();
    assert.deepEqual(page.assigns, []);
    assert.equal(page.store.getItem("korpasset.pendingInvite"), null);
    const idle = page.deeplink.consumePendingIfNeeded("pending", {
      currentPath: "/app",
      currentUrl: "https://korpasset.se/app",
      storage: page.store,
      assign(url) {
        page.assigns.push(url);
      },
    });
    assert.equal(idle.earlyReturn, "no-pending");
    assert.deepEqual(page.assigns, []);
  });

  it("returns early without routing when the invite URL is invalid", () => {
    const assigns: string[] = [];
    const result = apiOnly().consumeIncomingUrl("korpasset://invite/not valid", "cold start", {
      currentPath: "/app",
      currentUrl: "https://korpasset.se/app",
      storage: memoryStore(),
      assign(url) {
        assigns.push(url);
      },
    });
    assert.equal(result.earlyReturn, "unparsed");
    assert.equal(result.pendingSaved, false);
    assert.equal(result.token, null);
    assert.deepEqual(assigns, []);
  });

  it("does not navigate again when the WebView is already on the invite", () => {
    const assigns: string[] = [];
    const result = apiOnly().consumeIncomingUrl("korpasset://invite/same", "appUrlOpen", {
      currentPath: "/invite/same",
      currentUrl: "https://korpasset.se/invite/same",
      storage: memoryStore(),
      assign(url) {
        assigns.push(url);
      },
    });
    assert.equal(result.earlyReturn, "already-on-invite");
    assert.equal(result.pendingSaved, true);
    assert.deepEqual(assigns, []);
  });
});

describe("invalid invite page", () => {
  it("shows an explicit error for an unknown token", async () => {
    await resetDatabaseData();
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/invite/does-not-exist",
    });
    assert.equal(response.statusCode, 404);
    assert.match(response.body, /Inbjudan hittades inte/);
    await app.close();
  });

  it("still serves a pending invite page for a real token", async () => {
    await resetDatabaseData();
    const student = await createJourneyForStudent("Ella");
    const invitation = await createInvitation(student.journey.id, student.userId);
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: `/invite/${invitation.token}`,
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, new RegExp(`href="korpasset://invite/${invitation.token}"`));
    assert.doesNotMatch(response.body, /Fortsätt med Apple/);
    await app.close();
  });
});
