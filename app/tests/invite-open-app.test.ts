import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = readFileSync(join(root, "app/public/app-oauth.js"), "utf8");
const plist = readFileSync(join(root, "native/ios/App/App/Info.plist"), "utf8");

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

function load(pathname: string, native: boolean) {
  const panel = element({ hidden: "true", id: "invite-open-app" });
  const link = element({ id: "invite-open-app-link", href: "" });
  const form = element({ action: `/invite/token/accept` });
  const nodes = new Map<string, ReturnType<typeof element>>([
    ["invite-open-app", panel],
    ["invite-open-app-link", link],
  ]);
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById(id: string) {
        return nodes.get(id) ?? null;
      },
      querySelector(selector: string) {
        if (selector === 'form[action^="/invite/"]') return form;
        return null;
      },
      addEventListener() {},
    },
    window: {
      location: { pathname, search: "" },
      Capacitor: native
        ? { getPlatform: () => "ios", isNativePlatform: () => true }
        : undefined,
    },
  };
  runInContext(script, createContext(sandbox));
  return { panel, link, form };
}

describe("invitation link opens the app", () => {
  it("points a browser at korpasset://invite and hides the web form", () => {
    const page = load("/invite/abc_DEF-123", false);
    assert.equal(page.panel.hidden, false);
    assert.equal(page.link.attrs.href, "korpasset://invite/abc_DEF-123");
    assert.equal(page.form.hidden, true);
  });

  it("keeps the accept form inside the native app", () => {
    const page = load("/invite/abc_DEF-123", true);
    assert.equal(page.panel.hidden, true);
    assert.equal(page.form.hidden, false);
  });

  it("leaves ordinary pages alone", () => {
    const page = load("/app", false);
    assert.equal(page.panel.hidden, true);
    assert.equal(page.form.hidden, false);
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
