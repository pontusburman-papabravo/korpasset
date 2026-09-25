import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "node:test";
import {
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
} from "../src/http/consent.js";

const source = fs.readFileSync(new URL("../public/consent.js", import.meta.url), "utf8");

interface SeedCookie {
  name: string;
  value: string;
  domain?: string;
}

interface BootOptions {
  hostname?: string;
  version?: number;
  maxAge?: number;
  gaId?: string;
  metaPixelId?: string;
  cookies?: SeedCookie[];
}

function boot(options: BootOptions = {}) {
  const context = vm.createContext({
    console,
    Date,
    setTimeout,
    clearTimeout,
  });
  const prelude = `
    var __hostname = ${JSON.stringify(options.hostname ?? "korpasset.se")};
    var __jar = ${JSON.stringify(options.cookies ?? [])};
    var __scripts = [];
    function __visible(cookie) {
      if (!cookie.domain) return true;
      var bare = String(cookie.domain).replace(/^\\./, "");
      return __hostname === bare || __hostname.endsWith("." + bare);
    }
    function __read() {
      return __jar.filter(__visible).map(function (cookie) {
        return cookie.name + "=" + cookie.value;
      }).join("; ");
    }
    function __write(raw) {
      var bits = String(raw).split(";");
      var eq = bits[0].indexOf("=");
      var name = bits[0].slice(0, eq).trim();
      var value = bits[0].slice(eq + 1);
      var domain = "";
      var maxAge = null;
      for (var i = 1; i < bits.length; i += 1) {
        var part = bits[i].trim();
        var key = part.split("=")[0].toLowerCase();
        if (key === "domain") domain = part.slice(part.indexOf("=") + 1);
        if (key === "max-age") maxAge = Number(part.split("=")[1]);
      }
      if (maxAge === 0) {
        __jar = __jar.filter(function (cookie) {
          return cookie.name !== name || (cookie.domain || "") !== domain;
        });
        return;
      }
      __jar = __jar.filter(function (cookie) {
        return cookie.name !== name || (cookie.domain || "") !== domain;
      });
      __jar.push({ name: name, value: decodeURIComponent(value), domain: domain });
    }
    function Element(tag) {
      this.tagName = String(tag || "DIV").toUpperCase();
      this.attrs = {};
      this.children = [];
      this.parentElement = null;
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.listeners = {};
      this.className = "";
    }
    Element.prototype.setAttribute = function (key, value) {
      this.attrs[key] = String(value);
      if (key === "class") this.className = String(value);
      if (key === "hidden") this.hidden = true;
    };
    Element.prototype.hasAttribute = function (key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key);
    };
    Element.prototype.appendChild = function (child) {
      child.parentElement = this;
      this.children.push(child);
      if (this === head && child.src) __scripts.push(child.src);
      return child;
    };
    Element.prototype.addEventListener = function (type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    };
    Element.prototype.matches = function (sel) {
      if (sel.charAt(0) === ".") {
        return this.className.split(/\\s+/).indexOf(sel.slice(1)) !== -1;
      }
      if (sel.charAt(0) === "[") return this.hasAttribute(sel.slice(1, -1));
      return this.tagName === sel.toUpperCase();
    };
    Element.prototype.closest = function (sel) {
      var parts = sel.split(",");
      var node = this;
      while (node) {
        for (var i = 0; i < parts.length; i += 1) {
          if (node.matches && node.matches(parts[i].trim())) return node;
        }
        node = node.parentElement;
      }
      return null;
    };
    Element.prototype.querySelector = function (sel) {
      var parts = sel.split(",");
      function walk(node, includeSelf) {
        if (includeSelf && node.matches) {
          for (var i = 0; i < parts.length; i += 1) {
            if (node.matches(parts[i].trim())) return node;
          }
        }
        var kids = node.children || [];
        for (var j = 0; j < kids.length; j += 1) {
          var found = walk(kids[j], true);
          if (found) return found;
        }
        return null;
      }
      return walk(this, false);
    };
    Element.prototype.focus = function () {};
    Element.prototype.click = function () {
      var event = { target: this, preventDefault: function () {} };
      var node = this;
      while (node) {
        var list = (node.listeners && node.listeners.click) || [];
        for (var i = 0; i < list.length; i += 1) list[i](event);
        node = node.parentElement;
      }
    };
    function el(tag, attrs, children) {
      var node = new Element(tag);
      Object.keys(attrs || {}).forEach(function (key) {
        if (key === "className") node.setAttribute("class", attrs[key]);
        else node.setAttribute(key, attrs[key] === true ? "" : attrs[key]);
        if (key === "hidden") node.hidden = true;
        if (key === "checked") node.checked = true;
        if (key === "disabled") node.disabled = true;
      });
      (children || []).forEach(function (child) { node.appendChild(child); });
      return node;
    }
    var head = new Element("head");
    var analytics = el("input", { "data-consent-analytics": true });
    var marketing = el("input", { "data-consent-marketing": true });
    var banner = el("section", { className: "consent__banner" }, [
      el("button", { "data-consent-accept": true, className: "consent__btn consent__btn--primary" }),
      el("button", { "data-consent-reject": true, className: "consent__btn consent__btn--primary" }),
      el("button", { "data-consent-customize": true, className: "consent__btn consent__btn--quiet" })
    ]);
    var panel = el("section", { className: "consent__panel" }, [
      analytics,
      marketing,
      el("button", { "data-consent-save": true }),
      el("button", { "data-consent-accept": true }),
      el("button", { "data-consent-reject": true })
    ]);
    panel.hidden = true;
    var root = el("div", { "data-consent-root": true, className: "consent" }, [banner, panel]);
    root.hidden = true;
    var reopen = el("button", { "data-consent-open": true, className: "consent__reopen" });
    reopen.hidden = true;
    var body = el("body", {}, [root, reopen]);
    var document = {
      head: head,
      body: body,
      createElement: function (tag) { return new Element(tag); },
      querySelector: function (sel) { return body.querySelector(sel); },
      addEventListener: function (type, fn) { body.addEventListener(type, fn); }
    };
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: __read,
      set: __write
    });
    var location = { hostname: __hostname, protocol: "https:" };
    var window = globalThis;
    window.document = document;
    window.location = location;
    window.Element = Element;
    window.KORPASSET_CONSENT_CONFIG = {
      version: ${options.version ?? CONSENT_VERSION},
      cookieName: "korpasset_consent",
      maxAgeSeconds: ${options.maxAge ?? CONSENT_MAX_AGE_SECONDS},
      gaMeasurementId: ${JSON.stringify(options.gaId ?? "G-TEST123")},
      metaPixelId: ${JSON.stringify(options.metaPixelId ?? "")},
      leadCookieName: "korpasset_meta_lead"
    };
    globalThis.__root = root;
    globalThis.__reopen = reopen;
    globalThis.__banner = banner;
    globalThis.__panel = panel;
    globalThis.__analytics = analytics;
    globalThis.__marketing = marketing;
    globalThis.__scripts = __scripts;
    globalThis.__cookies = function () { return __jar; };
  `;
  vm.runInContext(`${prelude}\n${source}`, context);
  return context as Record<string, unknown>;
}

function gaDisabled(context: Record<string, unknown>, id = "G-TEST123"): unknown {
  return context[`ga-disable-${id}`];
}

function scriptSrcs(context: Record<string, unknown>): string[] {
  return context.__scripts as string[];
}

function cookieNames(context: Record<string, unknown>): string[] {
  return (context.__cookies as () => SeedCookie[])().map((cookie) => cookie.name);
}

function fbqCalls(context: Record<string, unknown>): string[][] {
  const fbq = context.fbq as { queue?: ArrayLike<ArrayLike<unknown>> } | undefined;
  if (!fbq?.queue) return [];
  return Array.from(fbq.queue).map((args) => Array.from(args).map((item) => String(item)));
}

function click(context: Record<string, unknown>, selector: string): void {
  const banner = context.__banner as { querySelector: (sel: string) => { click: () => void } };
  const panel = context.__panel as { querySelector: (sel: string) => { click: () => void } };
  const node = banner.querySelector(selector) || panel.querySelector(selector);
  node.click();
}

const now = Math.floor(Date.now() / 1000);

describe("consent runtime", () => {
  it("does not load Google on a first visit without consent", () => {
    const page = boot({
      cookies: [{ name: "_ga", value: "GA1.1.1.1", domain: "" }],
    });
    assert.equal((page.__root as { hidden: boolean }).hidden, false);
    assert.equal(gaDisabled(page), true);
    assert.equal(scriptSrcs(page).length, 0);
    assert.equal(cookieNames(page).includes("_ga"), false);
  });

  it("keeps Google unloaded when the visitor chooses only necessary cookies", () => {
    const page = boot();
    click(page, "[data-consent-reject]");
    assert.equal(gaDisabled(page), true);
    assert.equal(scriptSrcs(page).length, 0);
    assert.equal((page.__root as { hidden: boolean }).hidden, true);
    const stored = (page.__cookies as () => SeedCookie[])().find(
      (cookie) => cookie.name === "korpasset_consent",
    );
    assert.match(stored?.value ?? "", /^v\d+\.a0\.m0\./);
  });

  it("loads Google Analytics only after analytics consent, with ga-disable false first", () => {
    const page = boot();
    click(page, "[data-consent-customize]");
    (page.__analytics as { checked: boolean }).checked = true;
    click(page, "[data-consent-save]");
    assert.equal(gaDisabled(page), false);
    assert.equal(scriptSrcs(page).length, 1);
    assert.match(scriptSrcs(page)[0], /googletagmanager\.com\/gtag\/js\?id=G-TEST123/);
  });

  it("stops Analytics in the same page session when consent is withdrawn", () => {
    const page = boot({
      cookies: [{ name: "_ga", value: "GA1.1.9.9", domain: ".korpasset.se" }],
    });
    click(page, "[data-consent-accept]");
    assert.equal(gaDisabled(page), false);
    assert.equal(scriptSrcs(page).length, 1);
    let gtagCalls = 0;
    page.gtag = () => {
      gtagCalls += 1;
    };
    (page.__reopen as { click: () => void }).click();
    click(page, "[data-consent-reject]");
    assert.equal(gaDisabled(page), true);
    assert.equal(gtagCalls, 0);
    assert.equal(cookieNames(page).includes("_ga"), false);
    assert.equal(scriptSrcs(page).length, 1);
  });

  it("treats a missing, invalid, expired, or version-bumped choice as denied", () => {
    const cases: BootOptions[] = [
      { cookies: [{ name: "_ga", value: "1", domain: "" }] },
      {
        cookies: [
          { name: "korpasset_consent", value: "nope", domain: "" },
          { name: "_gcl_au", value: "1", domain: "" },
        ],
      },
      {
        cookies: [
          {
            name: "korpasset_consent",
            value: `v${CONSENT_VERSION}.a1.m1.${now - CONSENT_MAX_AGE_SECONDS - 5}`,
            domain: "",
          },
          { name: "_ga", value: "1", domain: "" },
        ],
      },
      {
        version: CONSENT_VERSION + 1,
        cookies: [
          {
            name: "korpasset_consent",
            value: `v${CONSENT_VERSION}.a1.m1.${now}`,
            domain: "",
          },
          { name: "_ga", value: "1", domain: ".korpasset.se" },
        ],
      },
    ];
    for (const options of cases) {
      const page = boot(options);
      assert.equal((page.__root as { hidden: boolean }).hidden, false, JSON.stringify(options));
      assert.equal(gaDisabled(page), true);
      assert.equal(scriptSrcs(page).length, 0);
      assert.equal(cookieNames(page).some((name) => name.startsWith("_ga") || name.startsWith("_gcl_")), false);
    }
  });

  it("deletes a parent-domain GA cookie from www", () => {
    const page = boot({
      hostname: "www.korpasset.se",
      cookies: [
        { name: "_ga", value: "GA1.1.2.2", domain: ".korpasset.se" },
        { name: "_gcl_au", value: "1", domain: ".korpasset.se" },
        { name: "bilklar_session", value: "keep", domain: "" },
      ],
    });
    click(page, "[data-consent-reject]");
    const names = cookieNames(page);
    assert.equal(names.includes("_ga"), false);
    assert.equal(names.includes("_gcl_au"), false);
    assert.equal(names.includes("bilklar_session"), true);
  });
});

const META_PIXEL_ID = "1358346629475279";

describe("Meta Pixel consent", () => {
  it("does not load the Meta script before marketing consent", () => {
    const page = boot({ metaPixelId: META_PIXEL_ID });
    assert.equal(scriptSrcs(page).some((src) => src.includes("facebook.net")), false);
    assert.equal(page.fbq, undefined);
    assert.equal(fbqCalls(page).length, 0);
  });

  it("sends one PageView after marketing consent and does not repeat it", () => {
    const page = boot({ metaPixelId: META_PIXEL_ID });
    click(page, "[data-consent-accept]");
    const facebook = scriptSrcs(page).filter((src) => src.includes("fbevents.js"));
    assert.equal(facebook.length, 1);
    assert.equal(String(facebook[0]), "https://connect.facebook.net/en_US/fbevents.js");
    const pageViews = fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "PageView");
    const inits = fbqCalls(page).filter((call) => call[0] === "init");
    assert.equal(pageViews.length, 1);
    assert.deepEqual(inits, [["init", META_PIXEL_ID]]);
    assert.equal(fbqCalls(page).some((call) => call[1] === "Lead"), false);

    (page.__reopen as { click: () => void }).click();
    click(page, "[data-consent-accept]");
    assert.equal(scriptSrcs(page).filter((src) => src.includes("fbevents.js")).length, 1);
    assert.equal(
      fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "PageView").length,
      1,
    );
  });

  it("sends Lead once after a saved signup when marketing consent is already granted", () => {
    const page = boot({
      metaPixelId: META_PIXEL_ID,
      cookies: [
        {
          name: "korpasset_consent",
          value: `v${CONSENT_VERSION}.a0.m1.${now}`,
          domain: "",
        },
        { name: "korpasset_meta_lead", value: "1", domain: "" },
      ],
    });
    const leads = fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "Lead");
    assert.equal(leads.length, 1);
    assert.equal(
      fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "PageView").length,
      1,
    );
    assert.equal(cookieNames(page).includes("korpasset_meta_lead"), false);
  });

  it("sends Lead when marketing consent is granted after the saved signup", () => {
    const page = boot({
      metaPixelId: META_PIXEL_ID,
      cookies: [{ name: "korpasset_meta_lead", value: "1", domain: "" }],
    });
    assert.equal(fbqCalls(page).length, 0);
    click(page, "[data-consent-accept]");
    assert.equal(
      fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "Lead").length,
      1,
    );
    assert.equal(
      fbqCalls(page).filter((call) => call[0] === "track" && call[1] === "PageView").length,
      1,
    );
  });

  it("does not send Lead or any Meta call without marketing consent", () => {
    const page = boot({
      metaPixelId: META_PIXEL_ID,
      cookies: [{ name: "korpasset_meta_lead", value: "1", domain: "" }],
    });
    click(page, "[data-consent-reject]");
    assert.equal(scriptSrcs(page).some((src) => src.includes("facebook.net")), false);
    assert.equal(page.fbq, undefined);
    assert.equal(cookieNames(page).includes("korpasset_meta_lead"), false);

    (page.__reopen as { click: () => void }).click();
    click(page, "[data-consent-customize]");
    (page.__analytics as { checked: boolean }).checked = true;
    click(page, "[data-consent-save]");
    assert.equal(page.fbq, undefined);
    assert.equal(scriptSrcs(page).some((src) => src.includes("facebook.net")), false);
  });

  it("does not send Lead when the signup was not saved", () => {
    const page = boot({
      metaPixelId: META_PIXEL_ID,
      cookies: [
        {
          name: "korpasset_consent",
          value: `v${CONSENT_VERSION}.a1.m1.${now}`,
          domain: "",
        },
      ],
    });
    assert.equal(fbqCalls(page).some((call) => call[1] === "Lead"), false);
    assert.equal(
      fbqCalls(page).filter((call) => call[1] === "PageView").length,
      1,
    );
  });
});
