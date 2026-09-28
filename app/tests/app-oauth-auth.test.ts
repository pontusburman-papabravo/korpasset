import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../public/app-oauth.js"),
  "utf8",
);

type OAuthTrace = {
  step?: string;
  attemptId?: string;
  provider?: string;
  reason?: string;
};

type SessionBody = { authenticated: boolean; redirectTo: string | null };

type AuthWindow = {
  KORPASSET_AUTH: {
    recover: (reason: string) => Promise<{
      authenticated?: boolean;
      skipped?: boolean;
      waiting?: boolean;
      outcome?: string;
    }>;
    continueWith: (provider: string) => Promise<void>;
    isInProgress: () => boolean;
    consumeAuthCallbackUrl: (url: string, event?: string) => boolean;
    readAuth: () => { attemptId?: string; phase?: string } | null;
    clearAuth: () => void;
    consumeIncomingUrl?: never;
  };
  KORPASSET_DEEPLINK: {
    consumeIncomingUrl: (
      url: string,
      eventType: string,
      ctx?: { assign?: (url: string) => void; currentPath?: string },
    ) => { earlyReturn: string | null; destinationUrl: string | null };
    parseInviteUrl: (url: string) => { token: string } | null;
  };
};

type Button = {
  textContent: string;
  disabled: boolean;
  attrs: Record<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

function button(provider: string, label: string): Button {
  return {
    textContent: label,
    disabled: false,
    attrs: { "data-oauth-provider": provider },
    getAttribute(name) {
      if (name === "data-oauth-provider") return provider;
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
  };
}

async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function installAuth(options: {
  platform?: string;
  session?: SessionBody | (() => SessionBody);
  login?: () => Promise<unknown>;
  launchUrl?: string;
  native?: boolean;
  hash?: string;
  pathname?: string;
  search?: string;
  pendingAuth?: Record<string, unknown> | null;
  initialize?: () => Promise<void>;
} = {}) {
  const google = button("google", "Fortsätt med Google");
  const apple = button("apple", "Fortsätt med Apple");
  const buttons = [apple, google];
  const consent = { hidden: false, attrs: {} as Record<string, string>, setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  } };
  const status = { hidden: true, textContent: "", id: "oauth-status", className: "muted" };
  const store = new Map<string, string>();
  if (options.pendingAuth) {
    store.set("korpasset.pendingAuth", JSON.stringify(options.pendingAuth));
  }
  const local = new Map<string, string>();

  const logins: Array<{ provider: string }> = [];
  const errors: string[] = [];
  const posts: Array<{ url: string; identityToken?: string }> = [];
  const assignments: string[] = [];
  const reloads: number[] = [];
  const traces: OAuthTrace[] = [];
  const beacons: string[] = [];
  const appStateListeners: Array<(state: { isActive: boolean }) => void> = [];
  let click: (event: {
    target: { closest: (selector: string) => Button | null };
    preventDefault: () => void;
  }) => void = () => {};

  const location = {
    pathname: options.pathname ?? "/app",
    search: options.search ?? "",
    hash: options.hash ?? "",
    href: `https://korpasset.se${options.pathname ?? "/app"}${options.search ?? ""}`,
    origin: "https://korpasset.se",
    assign(url: string) {
      assignments.push(url);
    },
    reload() {
      reloads.push(1);
    },
  };

  const sandbox: Record<string, unknown> = {
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    console: {
      info(label: string, event?: OAuthTrace) {
        if (label === "[korpasset-oauth]" && event) traces.push(event);
      },
    },
    document: {
      body: {},
      getElementById(id: string) {
        if (id === "oauth-status") return status;
        if (id === "oauth-error") {
          return {
            hidden: true,
            set textContent(value: string) {
              errors.push(value);
            },
          };
        }
        return null;
      },
      querySelector(selector: string) {
        if (selector.includes("[data-consent-root]")) return consent;
        if (selector.includes("data-oauth-provider") || selector.includes("oauth-continue")) {
          return { getAttribute: () => "/app" };
        }
        return null;
      },
      querySelectorAll(selector: string) {
        if (selector.includes("data-oauth-provider")) return buttons;
        return [];
      },
      createElement() {
        return { id: "", className: "", hidden: true, textContent: "", setAttribute() {} };
      },
      addEventListener(
        type: string,
        handler: (event: {
          target: { closest: (selector: string) => Button | null };
          preventDefault: () => void;
        }) => void,
      ) {
        if (type === "click") click = handler;
      },
    },
    crypto: {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(3);
        return bytes;
      },
    },
    fetch: async (url: string, init: { body?: string }) => {
      if (String(url).startsWith("/api/auth/session")) {
        const body = typeof options.session === "function"
          ? options.session()
          : (options.session ?? { authenticated: false, redirectTo: null });
        return { ok: true, status: 200, json: async () => body };
      }
      const body = JSON.parse(init.body ?? "{}") as { message?: string; identityToken?: string };
      if (url === "/api/client-error") {
        beacons.push(body.message ?? "");
        return { ok: true, status: 204, json: async () => ({}) };
      }
      posts.push({ url, identityToken: body.identityToken });
      return {
        ok: true,
        status: 200,
        json: async () => ({ redirectTo: "/onboarding", created: true }),
      };
    },
    window: {
      KORPASSET_OAUTH: {
        appleClientId: "se.korpasset.app",
        googleWebClientId: "web.apps.googleusercontent.com",
        googleIosClientId: "ios.apps.googleusercontent.com",
      },
      location,
      history: {
        replaceState(_state: null, _title: string, url: string) {
          location.hash = "";
          location.href = url;
        },
      },
      sessionStorage: {
        getItem(key: string) {
          return store.has(key) ? store.get(key)! : null;
        },
        setItem(key: string, value: string) {
          store.set(key, String(value));
        },
        removeItem(key: string) {
          store.delete(key);
        },
      },
      localStorage: {
        getItem(key: string) {
          return local.has(key) ? local.get(key)! : null;
        },
        setItem(key: string, value: string) {
          local.set(key, String(value));
        },
        removeItem(key: string) {
          local.delete(key);
        },
      },
    } as Record<string, unknown>,
  };

  if (options.native !== false) {
    (sandbox.window as Record<string, unknown>).Capacitor = {
      getPlatform: () => options.platform ?? "android",
      isNativePlatform: () => true,
      Plugins: {
        SocialLogin: {
          async initialize() {
            if (options.initialize) await options.initialize();
          },
          async login(call: { provider: string }) {
            logins.push(call);
            if (options.login) return options.login();
            return { result: { idToken: "identity-token", profile: { name: "Ada" } } };
          },
        },
        App: {
          addListener(name: string, handler: (state: { isActive: boolean }) => void) {
            if (name === "appStateChange") appStateListeners.push(handler);
          },
          async getLaunchUrl() {
            return options.launchUrl ? { url: options.launchUrl } : { url: "" };
          },
        },
      },
    };
  }

  runInContext(script, createContext(sandbox));
  const win = sandbox.window as unknown as AuthWindow;
  return {
    google,
    apple,
    consent,
    logins,
    posts,
    assignments,
    reloads,
    traces,
    beacons,
    errors,
    store,
    click,
    win,
    resume() {
      for (const listener of appStateListeners) listener({ isActive: true });
    },
    async tapGoogle() {
      click({
        target: {
          closest(selector: string) {
            if (selector !== "[data-oauth-provider]") return null;
            return google;
          },
        },
        preventDefault() {},
      });
      await flush();
    },
  };
}

function findTrace(traces: OAuthTrace[], step: string) {
  return traces.find((item) => item.step === step);
}

describe("Android Google auth lifecycle", () => {
  it("cold start: one Google tap posts once and navigates", async () => {
    const client = installAuth({ platform: "android", launchUrl: "" });
    await flush();
    await client.tapGoogle();
    assert.equal(client.logins.length, 1);
    assert.equal(client.posts.length, 1);
    assert.equal(client.posts[0].url, "/api/auth/google");
    assert.equal(client.assignments[0], "/onboarding");
    assert.equal(findTrace(client.traces, "auth_google_started")?.step, "auth_google_started");
    assert.equal(findTrace(client.traces, "auth_google_account_selected")?.step, "auth_google_account_selected");
    assert.equal(findTrace(client.traces, "auth_session_verified")?.step, "auth_session_verified");
    assert.equal(findTrace(client.traces, "auth_navigation_started")?.step, "auth_navigation_started");
    assert.equal(findTrace(client.traces, "auth_navigation_completed")?.step, "auth_navigation_completed");
    const attemptId = findTrace(client.traces, "auth_google_started")?.attemptId;
    assert.match(attemptId ?? "", /^[a-f0-9]{32}$/);
    assert.equal(findTrace(client.traces, "auth_navigation_completed")?.attemptId, attemptId);
    assert.equal(client.beacons.join("").includes("identity-token"), false);
  });

  it("warm app: resume then Google tap still starts exactly one login", async () => {
    const client = installAuth({ platform: "android" });
    await flush();
    client.resume();
    await flush();
    await client.tapGoogle();
    assert.equal(client.logins.length, 1);
    assert.equal(client.posts.length, 1);
    assert.equal(client.assignments[0], "/onboarding");
  });

  it("return from Google with an existing session navigates without another tap", async () => {
    const client = installAuth({
      platform: "android",
      session: { authenticated: true, redirectTo: "/onboarding" },
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "callback",
      },
    });
    await flush();
    assert.equal(client.logins.length, 0);
    assert.equal(client.assignments[0], "/onboarding");
    assert.equal(findTrace(client.traces, "auth_recovery_started")?.step, "auth_recovery_started");
    assert.equal(findTrace(client.traces, "auth_session_verified")?.step, "auth_session_verified");
    assert.equal(client.win.KORPASSET_AUTH.readAuth(), null);
  });

  it("recovers when the callback arrives before the router is ready", async () => {
    let authenticated = false;
    const late = installAuth({
      platform: "android",
      session: () =>
        authenticated
          ? { authenticated: true, redirectTo: "/journey/abc" }
          : { authenticated: false, redirectTo: null },
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "callback",
      },
    });
    await flush();
    assert.equal(late.assignments.length, 0);
    authenticated = true;
    await late.win.KORPASSET_AUTH.recover("native-resume");
    await flush();
    assert.equal(late.assignments[0], "/journey/abc");
    assert.equal(
      late.traces.some((item) => item.step === "auth_recovery_started" && item.reason === "native-resume"),
      true,
    );
  });

  it("app resume after OAuth revalidates the session and continues", async () => {
    let session: SessionBody = { authenticated: false, redirectTo: null };
    const client = installAuth({
      platform: "android",
      session: () => session,
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "browser",
      },
    });
    await flush();
    session = { authenticated: true, redirectTo: "/onboarding" };
    client.resume();
    await flush();
    assert.equal(client.assignments[0], "/onboarding");
    assert.equal(client.logins.length, 0);
  });

  it("double-tapping Fortsätt med Google starts one native login", async () => {
    let release: ((value: unknown) => void) | undefined;
    const client = installAuth({
      platform: "android",
      login: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    await flush();
    const first = client.tapGoogle();
    const second = client.tapGoogle();
    await flush();
    assert.equal(client.logins.length, 1);
    assert.equal(client.google.disabled, true);
    assert.equal(client.google.textContent, "Loggar in…");
    release?.({ result: { idToken: "identity-token", profile: { name: "Ada" } } });
    await first;
    await second;
    await flush();
    assert.equal(client.logins.length, 1);
    assert.equal(client.posts.length, 1);
    assert.equal(client.consent.hidden, true);
  });

  it("two start attempts do not create two OAuth flows", async () => {
    const client = installAuth({ platform: "android" });
    await flush();
    const started = client.win.KORPASSET_AUTH.continueWith("google");
    const blocked = client.win.KORPASSET_AUTH.continueWith("google");
    await started;
    await blocked;
    await flush();
    assert.equal(client.logins.length, 1);
    assert.ok(findTrace(client.traces, "auth_duplicate_start_blocked"));
  });

  it("recovers automatically from a stale logged-out login view", async () => {
    const client = installAuth({
      platform: "android",
      session: { authenticated: true, redirectTo: "/onboarding" },
    });
    await flush();
    assert.equal(client.logins.length, 0);
    assert.equal(client.assignments[0], "/onboarding");
    assert.equal(findTrace(client.traces, "auth_session_verified")?.step, "auth_session_verified");
  });

  it("skips the login screen when a session already exists", async () => {
    const client = installAuth({
      platform: "android",
      session: { authenticated: true, redirectTo: "/journey/home-1" },
    });
    await flush();
    assert.equal(client.logins.length, 0);
    assert.equal(client.assignments[0], "/journey/home-1");
  });

  it("lets the user retry after a cancelled OAuth without restarting", async () => {
    let cancelled = true;
    const client = installAuth({
      platform: "android",
      login: async () => {
        if (cancelled) {
          const error = new Error("Google Sign-In cancelled by user");
          (error as Error & { code?: string }).code = "USER_CANCELLED";
          throw error;
        }
        return { result: { idToken: "identity-token", profile: { name: "Ada" } } };
      },
    });
    await flush();
    await client.tapGoogle();
    assert.equal(client.posts.length, 0);
    assert.equal(client.google.disabled, false);
    assert.equal(client.google.textContent, "Fortsätt med Google");
    assert.equal(client.win.KORPASSET_AUTH.isInProgress(), false);
    cancelled = false;
    await client.tapGoogle();
    assert.equal(client.logins.length, 2);
    assert.equal(client.posts.length, 1);
    assert.equal(client.assignments[0], "/onboarding");
  });

  it("does not regress invite deep-link consumption", async () => {
    const client = installAuth({ platform: "android" });
    await flush();
    const assigned: string[] = [];
    const result = client.win.KORPASSET_DEEPLINK.consumeIncomingUrl(
      "https://korpasset.se/invite/abc_DEF-123",
      "appUrlOpen",
      { assign: (url) => assigned.push(url), currentPath: "/app" },
    );
    assert.equal(result.destinationUrl, "/invite/abc_DEF-123");
    assert.deepEqual(assigned, ["/invite/abc_DEF-123"]);
    assert.equal(
      client.win.KORPASSET_DEEPLINK.parseInviteUrl("korpasset://invite/tok_1")?.token,
      "tok_1",
    );
  });

  it("hides cookie consent and still completes auth navigation", async () => {
    const client = installAuth({
      platform: "android",
      session: { authenticated: true, redirectTo: "/onboarding" },
    });
    await flush();
    assert.equal(client.consent.hidden, true);
    assert.equal(client.consent.attrs["data-auth-hidden"], "1");
    assert.equal(client.assignments[0], "/onboarding");
  });

  it("opens a pending oauth_handoff instead of leaving the login view stale", async () => {
    const client = installAuth({ platform: "android" });
    await flush();
    const handled = client.win.KORPASSET_AUTH.consumeAuthCallbackUrl(
      "https://korpasset.se/app?oauth_handoff=handoffcodehandoffcode12",
      "appUrlOpen",
    );
    assert.equal(handled, true);
    assert.equal(
      client.assignments.at(-1),
      "/app?oauth_handoff=handoffcodehandoffcode12",
    );
    assert.equal(findTrace(client.traces, "auth_callback_received")?.step, "auth_callback_received");
    assert.equal(client.assignments.join("").includes("handoffcodehandoffcode12"), true);
    assert.equal(client.beacons.join("").includes("handoffcodehandoffcode12"), false);
  });

  it("does not permanently disable native Google after Credential Manager 16", async () => {
    let failNative = true;
    const client = installAuth({
      platform: "android",
      login: async () => {
        if (failNative) {
          throw new Error("Google Sign-In failed: [16] Account reauth failed");
        }
        return { result: { idToken: "identity-token", profile: { name: "Ada" } } };
      },
    });
    await flush();
    await client.tapGoogle();
    assert.equal(client.logins.length, 1);
    assert.equal(client.assignments.length, 0);
    assert.equal(client.google.disabled, false);
    assert.equal(client.win.KORPASSET_AUTH.isInProgress(), false);
    assert.equal(findTrace(client.traces, "google_browser_fallback"), undefined);
    failNative = false;
    await client.tapGoogle();
    assert.equal(client.logins.length, 2);
    assert.equal(client.posts.length, 1);
    assert.equal(client.assignments[0], "/onboarding");
  });

  it("uses one browser fallback when initialize reports 28444 before the picker", async () => {
    const client = installAuth({
      platform: "android",
      initialize: async () => {
        throw new Error(
          "Google Sign-In failed: Google Cloud OAuth is not configured for this installed build ([28444] Developer console is not set up correctly).",
        );
      },
    });
    await flush();
    await client.tapGoogle();
    assert.equal(client.logins.length, 0);
    assert.equal(client.posts.length, 0);
    assert.equal(findTrace(client.traces, "auth_path_selected")?.reason, "browser-before-picker");
    assert.match(client.assignments[0] ?? "", /response_mode=form_post/);
    assert.equal(client.beacons.join("").includes("id_token"), false);
  });

  it("keeps a pending browser attempt in recovery until resume can decide", async () => {
    const client = installAuth({
      platform: "android",
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "browser",
      },
    });
    await flush();
    const boot = await client.win.KORPASSET_AUTH.recover("boot");
    assert.equal(boot.waiting, true);
    assert.equal(boot.outcome, "pending");
    assert.equal(client.assignments.length, 0);
    assert.equal(client.google.disabled, true);
    assert.ok(client.win.KORPASSET_AUTH.readAuth());
    assert.equal(client.logins.length, 0);
  });

  it("turns an incomplete return into an explicit failed retry instead of a silent login screen", async () => {
    const client = installAuth({
      platform: "android",
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "browser",
      },
    });
    await flush();
    const result = await client.win.KORPASSET_AUTH.recover("resume");
    assert.equal(result.outcome, "failed");
    assert.equal(result.authenticated, false);
    assert.equal(client.assignments.length, 0);
    assert.equal(client.logins.length, 0);
    assert.equal(client.google.disabled, false);
    assert.equal(client.win.KORPASSET_AUTH.readAuth(), null);
    assert.equal(client.win.KORPASSET_AUTH.isInProgress(), false);
    assert.deepEqual(client.errors, ["Kunde inte slutföra inloggningen. Försök igen."]);
    assert.equal(findTrace(client.traces, "auth_session_failed")?.reason, "incomplete-return");
  });

  it("completes a callback/resume race only once and does not start OAuth", async () => {
    let session: SessionBody = { authenticated: false, redirectTo: null };
    const client = installAuth({
      platform: "android",
      session: () => session,
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "callback",
      },
    });
    await flush();
    session = { authenticated: true, redirectTo: "/onboarding" };
    const callback = client.win.KORPASSET_AUTH.recover("handoff");
    client.resume();
    const resume = client.win.KORPASSET_AUTH.recover("native-resume");
    await callback;
    await resume;
    await flush();
    assert.equal(client.assignments.filter((url) => url === "/onboarding").length, 1);
    assert.equal(client.logins.length, 0);
    assert.equal(client.reloads.length, 0);
    assert.equal(client.win.KORPASSET_AUTH.readAuth(), null);
  });

  it("does not navigate again when resume runs after a completed attempt", async () => {
    const client = installAuth({
      platform: "android",
      session: { authenticated: true, redirectTo: "/onboarding" },
    });
    await flush();
    assert.equal(client.assignments[0], "/onboarding");
    client.resume();
    const again = await client.win.KORPASSET_AUTH.recover("native-resume");
    await flush();
    assert.equal(again.skipped, true);
    assert.equal(client.assignments.length, 1);
    assert.equal(client.reloads.length, 0);
    assert.equal(client.logins.length, 0);
  });

  it("consumes the same oauth_handoff once and keeps the original attempt id", async () => {
    const client = installAuth({
      platform: "android",
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "browser",
      },
    });
    await flush();
    const url = "https://korpasset.se/app?oauth_handoff=handoffcodehandoffcode12";
    assert.equal(client.win.KORPASSET_AUTH.consumeAuthCallbackUrl(url, "appUrlOpen"), true);
    assert.equal(client.win.KORPASSET_AUTH.consumeAuthCallbackUrl(url, "appUrlOpen"), true);
    assert.equal(
      client.assignments.filter((item) => item.includes("oauth_handoff=")).length,
      1,
    );
    assert.equal(client.win.KORPASSET_AUTH.readAuth()?.attemptId, "03030303030303030303030303030303");
    assert.equal(
      client.traces.filter((item) => item.step === "auth_callback_received").length,
      1,
    );
    assert.equal(client.beacons.join("").includes("handoffcodehandoffcode12"), false);
    assert.equal(client.logins.length, 0);
  });

  it("does not duplicate resume recovery traces for the same attempt", async () => {
    const client = installAuth({
      platform: "android",
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "callback",
      },
    });
    await flush();
    client.resume();
    await flush();
    client.resume();
    await flush();
    assert.equal(
      client.traces.filter((item) => item.step === "auth_recovery_started" && item.reason === "resume")
        .length,
      1,
    );
    assert.equal(client.traces.filter((item) => item.step === "auth_google_started").length, 0);
    assert.equal(client.logins.length, 0);
  });

  it("restores retry from an oauth_error return without starting a new attempt", async () => {
    const client = installAuth({
      platform: "android",
      search: "?oauth_error=cancelled",
      pendingAuth: {
        attemptId: "03030303030303030303030303030303",
        provider: "google",
        returnTo: "/app",
        startedAt: Date.now(),
        phase: "browser",
      },
    });
    await flush();
    assert.equal(client.logins.length, 0);
    assert.equal(client.google.disabled, false);
    assert.equal(client.win.KORPASSET_AUTH.readAuth(), null);
    assert.equal(findTrace(client.traces, "google_login_cancelled")?.pluginCode, "cancelled");
    assert.deepEqual(client.errors, ["Inloggningen avbröts. Försök igen."]);
  });
});
