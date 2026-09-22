import { config } from "../config.js";
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

function faviconLink(): string {
  return `<link rel="icon" href="${BRAND_ASSETS.favicon}" type="image/svg+xml">`;
}

export interface AppLayoutOptions {
  journeyId?: string;
  role?: "student" | "supervisor";
}

function appNav(options: AppLayoutOptions = {}): string {
  const journeyId = options.journeyId ? escapeHtml(options.journeyId) : "";
  const homeHref = journeyId ? `/journey/${journeyId}` : "/app";
  const nextHref = journeyId ? `/journey/${journeyId}/drive/new` : "/app";
  const progressHref = journeyId ? `/journey/${journeyId}/utveckling` : "/konto";
  const nextLabel = options.role === "supervisor" ? "Fokus" : "Nästa";
  return `<nav class="app-tabbar" aria-label="Huvudmeny">
    <a href="${homeHref}">Resa</a>
    <a href="${nextHref}">${nextLabel}</a>
    <a href="${progressHref}">Utveckling</a>
    <a href="/hjalp">Hjälp</a>
    <a href="/konto">Konto</a>
  </nav>`;
}

export function layout(title: string, body: string, options: AppLayoutOptions = {}): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Körpasset</title>
  <meta name="robots" content="noindex, nofollow">
  ${faviconLink()}
  <link rel="stylesheet" href="/app.css">
</head>
<body class="app">
  <header class="app-bar">
    <a class="app-bar__brand" href="/app">
      <img src="${BRAND_ASSETS.logo}" alt="Körpasset">
    </a>
    <nav class="app-bar__nav" aria-label="Konto">
      <a href="/hjalp">Hjälp</a>
      <a href="/konto">Konto</a>
    </nav>
  </header>
  <main class="container">
    ${body}
  </main>
  ${appNav(options)}
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
</body>
</html>`;
}

export function missingSessionPage(): string {
  return layout(
    "Session saknas",
    `${errorBanner("Vi känner inte igen den här enheten.")}
     <h1>Öppna Körpasset igen</h1>
     <p>Om du är elev kan du starta eller fortsätta din körkortsresa här. Om du är handledare: öppna inbjudningslänken från eleven, eller be om en ny.</p>
     <a class="btn btn-primary" href="/app">Starta som elev</a>
     <p class="muted">Inbjudningslänken ser ut som korpasset.se/invite/…</p>`,
  );
}

export function invitationAlreadyUsedPage(studentName: string): string {
  return layout(
    "Inbjudan redan använd",
    `${errorBanner("Den här inbjudan är redan använd.")}
     <h1>Be om en ny länk</h1>
     <p>Inbjudan till ${escapeHtml(studentName)}s körkortsresa har redan accepterats.</p>
     <p>Om du redan anslutit: öppna Körpasset på samma telefon som förut. Om du bytt telefon, be eleven skapa en ny inbjudan.</p>
     <a class="btn btn-secondary" href="/">Till startsidan</a>`,
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
  const structuredData = options.jsonLd ? `\n  ${jsonLdScript(options.jsonLd)}` : "";

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
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <link rel="stylesheet" href="/landing.css">
  ${extraCss}${structuredData}
</head>
<body class="site">
  ${body}
</body>
</html>`;
}

export function oauthContinuePanel(intro?: string): string {
  return `${intro ? `<p>${intro}</p>` : ""}
         <div class="stack oauth-continue">
           <p>Fortsätt med Apple eller Google. Samma knapp är både första gången och när du kommer tillbaka.</p>
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
