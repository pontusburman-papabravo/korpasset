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
  return {
    hidden: attrs.hidden === "true",
    attrs: { ...attrs },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    },
  };
}

function load(pathname: string, native: boolean, panelHidden = true) {
  const panel = element({
    hidden: panelHidden ? "true" : "false",
    id: "invite-open-app",
  });
  const link = element({ id: "invite-open-app-link", href: "" });
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
      location: { pathname, search: "", href: `https://korpasset.se${pathname}`, assign() {} },
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
  return { panel, link, form, created };
}

describe("invitation link opens the app", () => {
  it("points a browser at korpasset://invite and hides the web form", () => {
    const page = load("/invite/abc_DEF-123", false);
    assert.equal(page.panel.hidden, false);
    assert.equal(page.link.attrs.href, "korpasset://invite/abc_DEF-123");
    assert.equal(page.form.hidden, true);
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
    assert.match(script, /App\.getLaunchUrl/);
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
