import { config } from "../config.js";

export const BRAND_ASSETS = {
  logo: "/brand/korpasset-logo.svg",
  favicon: "/brand/favicon.svg",
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

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Körpasset</title>
  ${faviconLink()}
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <header class="app-bar">
    <a class="app-bar__brand" href="/app">Körpasset</a>
    <nav class="app-bar__nav" aria-label="Konto">
      <a href="/konto">Konto</a>
    </nav>
  </header>
  <main class="container">
    ${body}
  </main>
</body>
</html>`;
}

export function siteLayout(
  title: string,
  body: string,
  options: { description?: string; extraCss?: string[]; path?: string } = {},
): string {
  const description =
    options.description ??
    "Övningskör med en plan. Körpasset hjälper elev och handledare att välja dagens fokus, följa upp på några sekunder och hålla ihop träningen mellan flera handledare.";
  const extraCss = (options.extraCss ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("\n  ");
  const pageTitle = `${title} · Körpasset`;
  const canonicalUrl = publicUrl(options.path ?? "/");
  const imageUrl = publicUrl(BRAND_ASSETS.ogImage);

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${faviconLink()}
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="/landing.css">
  ${extraCss}
</head>
<body class="site">
  ${body}
</body>
</html>`;
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
