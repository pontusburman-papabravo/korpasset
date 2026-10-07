import { config } from "../config.js";
import { consentBody, consentHead } from "./consent.js";
import { jsonLdScript, SITE_DESCRIPTION, SITE_NAME, SITE_THEME_COLOR } from "./seo.js";

export const BRAND_ASSETS = {
  logo: "/brand/korpasset-logo.svg",
  favicon: "/brand/favicon.svg",
  appleTouchIcon: "/brand/korpasset-social-1024.png",
  ogImage: "/brand/korpasset-og-1200x630.png",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function publicUrl(path: string): string {
  const base = config.appBaseUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function publicOAuthConfig(): {
  appleClientId: string;
  googleWebClientId: string;
  googleIosClientId: string;
} {
  return {
    appleClientId: config.appleAudiences[0] ?? config.appleBundleId,
    googleWebClientId: config.googleWebClientId,
    googleIosClientId: config.googleIosClientId,
  };
}

function faviconLink(): string {
  return `<link rel="icon" href="${BRAND_ASSETS.favicon}" type="image/svg+xml">`;
}

export type AppTab = "resa" | "nasta" | "utveckling" | "mer";

export interface AppLayoutOptions {
  journeyId?: string;
  role?: "student" | "supervisor";
  activeTab?: AppTab | null;
  /** Logged-out login has no product tabs. Reviewers were tapping them instead of Google. */
  navigation?: boolean;
  /** Set false on the help form itself, where the bubble would cover the fields. */
  supportBubble?: boolean;
}

function tabIcon(name: AppTab): string {
  const icons: Record<AppTab, string> = {
    resa: `<path d="M4 16.5c2.2-3 4.2-4.5 8-4.5s5.8 1.5 8 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 7.5h8M10 4.5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>`,
    nasta: `<circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.2 8.6 16 12l-5.8 3.4V8.6z" fill="currentColor"/>`,
    utveckling: `<path d="M5 16.5 9.2 11l3.3 3.2L19 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 7.5H19V12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    mer: `<circle cx="6.5" cy="12" r="1.45" fill="currentColor"/><circle cx="12" cy="12" r="1.45" fill="currentColor"/><circle cx="17.5" cy="12" r="1.45" fill="currentColor"/>`,
  };
  return `<svg class="app-tabbar__icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

function tabLink(tab: AppTab, label: string, href: string, activeTab?: AppTab | null): string {
  const current = activeTab === tab ? ` aria-current="page"` : "";
  return `<a href="${href}"${current}>${tabIcon(tab)}<span>${label}</span></a>`;
}

function appNav(options: AppLayoutOptions = {}): string {
  return `<nav class="app-tabbar" aria-label="Huvudmeny">
    ${tabLink("resa", "Resa", "/resa", options.activeTab)}
    ${tabLink("nasta", "Nästa", "/nasta", options.activeTab)}
    ${tabLink("utveckling", "Utveckling", "/utveckling", options.activeTab)}
    ${tabLink("mer", "Mer", "/mer", options.activeTab)}
  </nav>`;
}

function supportBubble(): string {
  return `<div class="support-bubble">
    <details class="support-bubble__details">
      <summary class="support-bubble__button">
        <svg class="support-bubble__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7.25h12a2.25 2.25 0 0 1 2.25 2.25v5.5A2.25 2.25 0 0 1 18 17.25h-5.2L8.2 20v-2.75H6A2.25 2.25 0 0 1 3.75 15V9.5A2.25 2.25 0 0 1 6 7.25z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
        <span>Hjälp</span>
      </summary>
      <div class="support-bubble__panel">
        <p class="support-bubble__title">Hur kan vi hjälpa till?</p>
        <p class="support-bubble__text">Rapportera en bugg eller skriv till supporten.</p>
        <a class="btn btn-primary" data-support-href="/hjalp?topic=technical" href="/hjalp?topic=technical">Rapportera en bugg</a>
        <a class="btn btn-secondary" data-support-href="/hjalp" href="/hjalp">Skriv till support</a>
      </div>
    </details>
  </div>
  <script>
    (function () {
      var root = document.querySelector(".support-bubble");
      if (!root) return;
      var details = root.querySelector("details");
      var path = location.pathname || "/";
      var search = location.search || "";
      if (search && (path + search).length <= 180) path += search;
      root.querySelectorAll("[data-support-href]").forEach(function (link) {
        var base = link.getAttribute("data-support-href");
        if (!base) return;
        link.href = base + (base.indexOf("?") === -1 ? "?" : "&") + "from=" + encodeURIComponent(path);
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && details && details.open) details.open = false;
      });
      document.addEventListener("click", function (event) {
        if (!details || !details.open) return;
        var target = event.target;
        if (target && root.contains(target)) return;
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
      }, true);
    })();
  </script>`;
}

/** Product pages. No public cookie banner — Apple Review loads this in the iOS WebView. */
export function layout(title: string, body: string, options: AppLayoutOptions = {}): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)} · Körpasset</title>
  <meta name="robots" content="noindex, nofollow">
  ${faviconLink()}
  <link rel="stylesheet" href="/app.css">
</head>
<body class="app${options.supportBubble === false ? "" : " app--support"}">
  <header class="app-bar">
    <a class="app-bar__brand" href="/resa">
      <img src="${BRAND_ASSETS.logo}" alt="Körpasset">
    </a>
  </header>
  <main class="container">
    ${body}
  </main>
  ${options.navigation === false ? "" : appNav(options)}
  ${options.supportBubble === false ? "" : supportBubble()}
  <script>
    window.addEventListener("error", function (event) {
      try {
        fetch("/api/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: String(event.message || "error").slice(0, 500),
            path: location.pathname
          }),
          keepalive: true
        });
      } catch (ignore) {}
    });
    window.addEventListener("unhandledrejection", function (event) {
      try {
        var reason = event.reason;
        fetch("/api/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: String(reason && reason.message || reason || "rejection").slice(0, 500),
            path: location.pathname
          }),
          keepalive: true
        });
      } catch (ignore) {}
    });
  </script>
  <script>window.KORPASSET_OAUTH = ${JSON.stringify(publicOAuthConfig())};</script>
  <script src="/app-oauth.js" defer></script>
  <script src="/share.js" defer></script>
  <script>
    (function () {
      var body = { platform: "", version: "", build: "" };
      var cap = window.Capacitor;
      function send() {
        try {
          fetch("/api/client", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            keepalive: true,
            body: JSON.stringify(body)
          });
        } catch (ignore) {}
      }
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") send();
      });
      var appPlugin = cap && cap.Plugins && cap.Plugins.App;
      if (appPlugin && typeof appPlugin.addListener === "function") {
        appPlugin.addListener("appStateChange", function (state) {
          if (state && state.isActive) send();
        });
      }
      if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) {
        send();
        return;
      }
      if (typeof cap.getPlatform === "function") body.platform = String(cap.getPlatform() || "");
      var plugin = cap.Plugins && cap.Plugins.App;
      if (!plugin || typeof plugin.getInfo !== "function") {
        send();
        return;
      }
      Promise.resolve(plugin.getInfo()).then(function (info) {
        if (info && info.version) body.version = String(info.version);
        if (info && info.build) body.build = String(info.build);
        send();
      }).catch(send);
    })();
  </script>
</body>
</html>`;
}

export function invitationAlreadyUsedPage(studentName: string): string {
  return layout(
    "Inbjudan redan använd",
    `${errorBanner("Den här inbjudan är redan använd.")}
     <h1>Be om en ny länk</h1>
     <p>Inbjudan till ${escapeHtml(studentName)}s körkortsresa har redan accepterats.</p>
     <p>Om du redan anslutit: öppna Körpasset på samma telefon som förut. Om du bytt telefon, be eleven skapa en ny inbjudan.</p>
     <a class="btn btn-secondary" href="/app">Öppna Körpasset</a>`,
  );
}

export function siteLayout(
  title: string,
  body: string,
  options: {
    description?: string;
    extraCss?: string[];
    path?: string;
    documentTitle?: string;
    robots?: string;
    jsonLd?: unknown;
    ogType?: string;
    /** Admin pages stay free of the public cookie banner and analytics tag. */
    consent?: boolean;
  } = {},
): string {
  const description = options.description ?? SITE_DESCRIPTION;
  const extraCss = (options.extraCss ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("\n  ");
  const pageTitle = options.documentTitle ?? `${title} · ${SITE_NAME}`;
  const canonicalUrl = publicUrl(options.path ?? "/");
  const imageUrl = publicUrl(BRAND_ASSETS.ogImage);
  const robots = options.robots ?? "index, follow";
  const ogType = options.ogType ?? "website";
  const structuredData = options.jsonLd ? `\n  ${jsonLdScript(options.jsonLd)}` : "";
  const consent = options.consent === false ? "" : `\n  ${consentHead()}`;
  const consentMarkup = options.consent === false ? "" : `\n  ${consentBody()}`;

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" hreflang="sv" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(canonicalUrl)}">
  ${faviconLink()}
  <link rel="apple-touch-icon" href="${BRAND_ASSETS.appleTouchIcon}">
  <meta name="theme-color" content="${SITE_THEME_COLOR}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="sv_SE">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} – övningskörning för att ta körkort`)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <link rel="stylesheet" href="/landing.css">
  ${extraCss}${structuredData}${consent}
</head>
<body class="site">
  ${body}
  ${consentMarkup}
</body>
</html>`;
}

export function oauthContinuePanel(intro?: string, returnTo = "/app"): string {
  return `${intro ? `<p>${intro}</p>` : ""}
         <div class="stack oauth-continue" data-return-to="${escapeHtml(returnTo)}">
           <p>Fortsätt med Apple eller Google</p>
           <p class="muted">Första gången skapas ditt konto automatiskt. Nästa gång använder du samma val för att logga in.</p>
           <p id="oauth-error" class="banner banner-error" hidden></p>
           <div id="oauth-google-reauth" class="stack" hidden>
             <p id="oauth-google-reauth-how" class="muted">Google avbröt efter kontoväljaren utan mejl och utan en ruta att godkänna. Tryck Fortsätt med Google igen. Samma sak en gång till betyder att Google nekar Körpasset på den här telefonen just nu — inte att du missat en knapp.</p>
           </div>
           <p id="oauth-status" class="muted" hidden>Loggar in…</p>
           <p id="oauth-google-hint" class="muted" hidden>Första gången med Körpasset kan Google stoppa inloggningen, även på en telefon du redan använder. Det är Google som gör det, inte Körpasset.</p>
           <button type="button" class="btn btn-primary" id="continue-apple" data-oauth-provider="apple">Fortsätt med Apple</button>
           <button type="button" class="btn btn-secondary" id="continue-google" data-oauth-provider="google">Fortsätt med Google</button>
         </div>`;
}

export function primaryButton(label: string, attrs = ""): string {
  return `<button type="submit" class="btn btn-primary" ${attrs}>${escapeHtml(label)}</button>`;
}

export function errorBanner(message: string): string {
  return `<div class="banner banner-error" role="alert">${escapeHtml(message)}</div>`;
}

export function successBanner(message: string): string {
  return `<div class="banner banner-success" role="status">${escapeHtml(message)}</div>`;
}
