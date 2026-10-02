import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "app/public/app-oauth.js"), "utf8");
const css = readFileSync(join(root, "app/public/app.css"), "utf8");
const plist = readFileSync(join(root, "native/ios/App/App/Info.plist"), "utf8");
const sceneDelegate = readFileSync(
  join(root, "native/ios/App/App/SceneDelegate.swift"),
  "utf8",
);

function element(attrs: Record<string, string> = {}) {
  const el = {
    hidden: attrs.hidden === "true",
    textContent: "",
    attrs: { ...attrs },
    listeners: {} as Record<string, (event: { preventDefault: () => void }) => void>,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    },
    addEventListener(type: string, fn: (event: { preventDefault: () => void }) => void) {
      this.listeners[type] = fn;
    },
  };
  return el;
}

function load(
  pathname: string,
  native: boolean,
  panelHidden = true,
  options: { search?: string; userAgent?: string; platform?: string; maxTouchPoints?: number } = {},
) {
  const assigns: string[] = [];
  const panel = element({
    hidden: panelHidden ? "true" : "false",
    id: "invite-open-app",
  });
  const link = element({ id: "invite-open-app-link" });
  const status = element({ id: "invite-open-status" });
  const iosStore = element({ id: "invite-app-store", class: "btn btn-primary" });
  const playStore = element({ id: "invite-play-store", class: "btn btn-secondary" });
  const form = element({ action: `/invite/token/accept` });
  const created: Array<{ textContent: string; attrs: Record<string, string> }> = [];
  const parent = {
    insertBefore() {},
    appendChild() {},
  };
  (form as { parentNode?: unknown }).parentNode = parent;
  const nodes = new Map<string, ReturnType<typeof element>>([
    ["invite-open-app", panel],
    ["invite-open-app-link", link],
    ["invite-open-status", status],
    ["invite-app-store", iosStore],
    ["invite-play-store", playStore],
  ]);
  const sandbox: Record<string, unknown> = {
    URL,
    console,
    document: {
      getElementById(id: string) {
        return nodes.get(id) ?? null;
      },
      querySelector(selector: string) {
        if (selector === 'form[action^="/invite/"]') return form;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      createElement() {
        const el = {
          className: "",
          hidden: false,
          textContent: "",
          attrs: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            this.attrs[name] = value;
          },
          appendChild() {},
        };
        created.push(el);
        return el;
      },
      addEventListener() {},
      body: parent,
    },
    window: {
      location: {
        pathname,
        search: options.search ?? "",
        href: `https://korpasset.se${pathname}${options.search ?? ""}`,
        assign(url: string) {
          assigns.push(url);
        },
      },
      navigator: {
        userAgent: options.userAgent ?? "",
        platform: options.platform ?? "",
        maxTouchPoints: options.maxTouchPoints ?? 0,
      },
      setTimeout,
      clearTimeout,
      sessionStorage: {
        getItem() {
          return null;
        },
        setItem() {},
        removeItem() {},
      },
      Capacitor: native
        ? { getPlatform: () => "ios", isNativePlatform: () => true }
        : undefined,
    },
  };
  runInContext(script, createContext(sandbox));
  const api = (sandbox.window as { KORPASSET_DEEPLINK: {
    inviteOpenUrl: (token: string, platform: string) => string;
    openInviteFromBrowser: (token: string) => string;
    browserPlatform: () => string;
  } }).KORPASSET_DEEPLINK;
  return { panel, link, form, created, assigns, status, iosStore, playStore, api };
}

describe("invitation link opens the app", () => {
  it("shows store choice in the browser and does not navigate to korpasset://", () => {
    const page = load("/invite/abc_DEF-123", false);
    assert.equal(page.panel.hidden, false);
    assert.equal(page.link.attrs.href, undefined);
    assert.equal(page.assigns.length, 0);
    assert.equal(page.iosStore.attrs.class, "btn btn-primary");
    assert.equal(page.playStore.attrs.class, "btn btn-secondary");
    assert.equal(page.form.hidden, false);
  });

  it("opens an installed iPhone app only from the explicit button", () => {
    const page = load("/invite/abc_DEF-123", false, true, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    });
    assert.equal(page.assigns.length, 0);
    assert.equal(page.api.browserPlatform(), "ios");
    assert.equal(page.api.inviteOpenUrl("abc_DEF-123", "ios"), "korpasset://invite/abc_DEF-123");
    page.link.listeners.click({ preventDefault() {} });
    assert.deepEqual(page.assigns, ["korpasset://invite/abc_DEF-123"]);
  });

  it("checks for the Android app and falls back to the store choice", () => {
    const page = load("/invite/abc_DEF-123", false, true, {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
    });
    assert.equal(page.api.browserPlatform(), "android");
    assert.equal(page.playStore.attrs.class, "btn btn-primary");
    assert.equal(page.iosStore.attrs.class, "btn btn-secondary");
    assert.equal(page.assigns.length, 1);
    assert.match(page.assigns[0], /^intent:\/\/invite\/abc_DEF-123#Intent;/);
    assert.match(page.assigns[0], /scheme=korpasset/);
    assert.match(page.assigns[0], /package=se\.korpasset\.app/);
    assert.match(
      page.assigns[0],
      /S\.browser_fallback_url=https%3A%2F%2Fkorpasset\.se%2Finvite%2Fabc_DEF-123%3Finstall%3D1/,
    );
  });

  it("stays on the store choice when Android already reported the app missing", () => {
    const page = load("/invite/abc_DEF-123", false, true, {
      search: "?install=1",
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile",
    });
    assert.deepEqual(page.assigns, []);
    assert.match(page.status.textContent, /App Store eller Google Play/);
  });

  it("keeps the accept form inside the native app and hides Öppna i Körpasset", () => {
    const page = load("/invite/abc_DEF-123", true, false);
    assert.equal(page.panel.hidden, true);
    assert.equal(page.form.hidden, false);
    const providers = page.created
      .map((el) => el.attrs["data-oauth-provider"])
      .filter(Boolean);
    assert.deepEqual(providers, ["apple", "google"]);
    assert.equal(
      page.created.some((el) => el.textContent === "Öppna i Körpasset"),
      false,
    );
  });

  it("does not inject Apple/Google login in the browser invite page", () => {
    const page = load("/invite/abc_DEF-123", false);
    assert.equal(page.panel.hidden, false);
    assert.equal(
      page.created.some((el) => el.attrs["data-oauth-provider"]),
      false,
    );
  });

  it("keeps [hidden] from being shown by .stack layout", () => {
    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });

  it("leaves ordinary pages alone", () => {
    const page = load("/app", false);
    assert.equal(page.panel.hidden, true);
    assert.equal(page.form.hidden, false);
  });

  it("listens for Capacitor appUrlOpen and getLaunchUrl", () => {
    assert.match(script, /App\.addListener\("appUrlOpen"/);
    assert.match(script, /App\.addListener\("appStateChange"/);
    assert.match(script, /App\.getLaunchUrl/);
    assert.match(script, /KORPASSET_AUTH/);
    assert.match(script, /auth_recovery_started/);
    assert.match(script, /korpasset\.pendingInvite/);
  });

  it("retries native handoff when the WebView is not ready and /app loads first", () => {
    assert.match(sceneDelegate, /korpasset-deeplink/);
    assert.match(sceneDelegate, /webView-nil/);
    assert.match(sceneDelegate, /pendingInviteURL/);
    assert.match(sceneDelegate, /evaluateJavaScript/);
    assert.match(sceneDelegate, /korpasset\.pendingInvite/);
  });

  it("registers one URL type list with Google and the app scheme", () => {
    assert.equal(plist.split("<key>CFBundleURLTypes</key>").length - 1, 1);
    assert.match(plist, /<string>korpasset<\/string>/);
    assert.match(
      plist,
      /<string>com\.googleusercontent\.apps\.996223016705-br4rn62e3gd3ban81vulomh8r52i4bhr<\/string>/,
    );
  });
});
