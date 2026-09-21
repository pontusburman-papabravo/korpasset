import { config } from "../config.js";

export const SITE_NAME = "Körpasset";
export const SITE_THEME_COLOR = "#1A2B4C";
export const SITE_DESCRIPTION =
  "Planera privat övningskörning mot B-körkort. Körpasset hjälper elev och handledare att välja dagens fokus, följa upp körpassen och hålla ihop träningen — även när flera turas om.";
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
    path: "/villkor",
    priority: "0.4",
    changefreq: "yearly",
  },
] as const;

const ROBOTS_DISALLOW = [
  "/admin",
  "/admin/",
  "/api/",
  "/health",
  "/hjalp",
  "/hjalp/",
  "/interest/tack",
  "/invite/",
  "/journey/",
  "/konto",
  "/konto/",
  "/onboarding",
  "/start",
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
  faq?: FaqItem[];
  includeApp?: boolean;
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
      "@type": "WebApplication",
      name: SITE_NAME,
      url: origin,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      inLanguage: "sv-SE",
      description: SITE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "SEK",
      },
      publisher: { "@id": organizationId },
    });
  }

  if (options.faq && options.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      url: `${pageUrl}#fragor`,
      inLanguage: "sv-SE",
      mainEntity: options.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
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
