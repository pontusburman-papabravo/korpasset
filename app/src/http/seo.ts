import { config } from "../config.js";
import { PRACTICE_SITEMAP_PAGES } from "./guide-content.js";

export const SITE_NAME = "Körpasset";
export const SITE_THEME_COLOR = "#1A2B4C";
export const SITE_DESCRIPTION =
  "Privat övningskörning mot B-körkort. Körpasset hjälper körkortselev och handledare att övningsköra med en plan, träna inför körkort och hålla koll mot uppkörning.";
const SITE_LOGO_PATH = "/brand/korpasset-logo.svg";

function absoluteUrl(path: string): string {
  const base = config.appBaseUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export const PUBLIC_INDEX_PAGES = [
  {
    path: "/",
    priority: "1.0",
    changefreq: "weekly",
  },
  ...PRACTICE_SITEMAP_PAGES,
  {
    path: "/kontakt",
    priority: "0.7",
    changefreq: "monthly",
  },
  {
    path: "/integritet",
    priority: "0.4",
    changefreq: "yearly",
  },
  {
    path: "/cookies",
    priority: "0.4",
    changefreq: "yearly",
  },
  {
    path: "/villkor",
    priority: "0.4",
    changefreq: "yearly",
  },
  {
    path: "/radera-konto",
    priority: "0.4",
    changefreq: "yearly",
  },
] as const;

const ROBOTS_DISALLOW = [
  "/admin",
  "/admin/",
  "/api/",
  "/app",
  "/app/",
  "/guide",
  "/guide/",
  "/health",
  "/hjalp",
  "/hjalp/",
  "/interest/tack",
  "/invite/",
  "/journey/",
  "/konto",
  "/konto/",
  "/logout",
  "/mer",
  "/nasta",
  "/onboarding",
  "/resa",
  "/start",
  "/utveckling",
] as const;

export interface FaqItem {
  question: string;
  answer: string;
}

export function robotsTxt(): string {
  const lines = [
    "# Körpasset — https://korpasset.se",
    "User-agent: *",
    "Allow: /",
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
  ];
  return lines.join("\n");
}

export function sitemapXml(): string {
  const urls = PUBLIC_INDEX_PAGES.map((page) => {
    return `  <url>
    <loc>${escapeXml(absoluteUrl(page.path))}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export function publicPageJsonLd(options: {
  path: string;
  title: string;
  description: string;
  includeApp?: boolean;
  /** Real install URL. Only set when the native app is actually available. */
  appDownloadUrl?: string;
}): unknown {
  const pageUrl = absoluteUrl(options.path);
  const origin = absoluteUrl("/");
  const organizationId = `${origin}#organization`;
  const websiteId = `${origin}#website`;

  const graph: unknown[] = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: SITE_NAME,
      url: origin,
      email: "info@korpasset.se",
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl(SITE_LOGO_PATH),
      },
      parentOrganization: {
        "@type": "Organization",
        name: "Papa Bravo AB",
      },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: SITE_NAME,
      url: origin,
      inLanguage: "sv-SE",
      description: SITE_DESCRIPTION,
      publisher: { "@id": organizationId },
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: options.title,
      description: options.description,
      inLanguage: "sv-SE",
      isPartOf: { "@id": websiteId },
      about: { "@id": organizationId },
    },
  ];

  if (options.includeApp) {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${origin}#app`,
      name: SITE_NAME,
      url: origin,
      applicationCategory: "EducationalApplication",
      // iOS is in the App Store. Android is published but still waiting for Google approval, so it is omitted.
      operatingSystem: "iOS",
      inLanguage: "sv-SE",
      description: SITE_DESCRIPTION,
      ...(options.appDownloadUrl ? { downloadUrl: options.appDownloadUrl } : {}),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "SEK",
      },
      publisher: { "@id": organizationId },
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** Article + breadcrumb for a public guide. Organization is included once, as publisher. */
export function articlePageJsonLd(options: {
  path: string;
  headline: string;
  description: string;
  breadcrumbs: BreadcrumbItem[];
}): unknown {
  const pageUrl = absoluteUrl(options.path);
  const origin = absoluteUrl("/");
  const organizationId = `${origin}#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: origin,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl(SITE_LOGO_PATH),
        },
      },
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        headline: options.headline,
        description: options.description,
        inLanguage: "sv-SE",
        mainEntityOfPage: pageUrl,
        url: pageUrl,
        author: { "@id": organizationId },
        publisher: { "@id": organizationId },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: options.breadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: absoluteUrl(item.path),
        })),
      },
    ],
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
