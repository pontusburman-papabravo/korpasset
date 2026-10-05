import type { FastifyInstance, FastifyRequest } from "fastify";
import { wantsPublicCookieConsent } from "../auth/session.js";
import {
  CLUSTER_GUIDES,
  HUB_PATH,
  LEGACY_GUIDE_REDIRECTS,
  MOMENT_GUIDES,
  MOMENT_ORDER,
  PLAN_PATH,
  PRACTICE_HUB,
  SUPERVISOR_GUIDE,
  SUPERVISOR_PATH,
  momentByPath,
  type GuideItem,
  type GuideLink,
  type MomentGuide,
  type StandaloneGuide,
} from "./guide-content.js";
import {
  APP_STORE_URL,
  TRANSPORTSTYRELSEN_LINKS,
  siteFooter,
  siteHeader,
} from "./landing.js";
import { escapeHtml, siteLayout } from "./layout.js";
import { articlePageJsonLd, type BreadcrumbItem } from "./seo.js";

function externalAttrs(href: string): string {
  if (href.startsWith("https://") || href.startsWith("http://")) {
    return ` rel="noopener noreferrer" target="_blank"`;
  }
  return "";
}

function richItem(item: GuideItem): string {
  if (typeof item === "string") return `<li>${escapeHtml(item)}</li>`;
  return `<li>${escapeHtml(item.text)} <a href="${escapeHtml(item.href)}"${externalAttrs(item.href)}>${escapeHtml(item.linkLabel)}</a></li>`;
}

function bullets(items: readonly GuideItem[]): string {
  return `<ul>${items.map((item) => (typeof item === "string" ? `<li>${escapeHtml(item)}</li>` : richItem(item))).join("")}</ul>`;
}

function numbered(items: readonly GuideItem[]): string {
  return `<ol>${items.map((item) => richItem(item)).join("")}</ol>`;
}

function linkList(links: GuideLink[]): string {
  return `<ul class="official-links">${links
    .map((link) => {
      const note = link.note ? ` <span class="muted">— ${escapeHtml(link.note)}</span>` : "";
      return `<li><a href="${escapeHtml(link.href)}"${externalAttrs(link.href)}>${escapeHtml(link.label)}</a>${note}</li>`;
    })
    .join("")}</ul>`;
}

function paragraphs(items: string[]): string {
  return items.map((item) => `<p>${escapeHtml(item)}</p>`).join("");
}

function crumb(items: BreadcrumbItem[]): string {
  const parts = items.map((item, index) => {
    const last = index === items.length - 1;
    if (last) return `<span aria-current="page">${escapeHtml(item.name)}</span>`;
    return `<a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a>`;
  });
  return `<nav class="muted" aria-label="Brödsmulor">${parts.join(" · ")}</nav>`;
}

function downloadCta(): string {
  return `<p><a class="btn btn-primary" href="/#intresse">Ladda ner Körpasset</a></p>
    <p class="muted">På iPhone laddar du ner i <a href="${APP_STORE_URL}" rel="noopener noreferrer">App Store</a>. På Android lämnar du mejl tills öppet test finns.</p>`;
}

function nearbyLinks(guide: MomentGuide): string {
  const index = MOMENT_ORDER.indexOf(guide.path);
  const links: Array<{ href: string; label: string; note: string }> = [
    { href: HUB_PATH, label: "Hela guiden om övningskörning", note: "Plan och ordning mellan momenten" },
  ];
  const previous = index > 0 ? momentByPath(MOMENT_ORDER[index - 1]) : undefined;
  const next = index >= 0 && index < MOMENT_ORDER.length - 1
    ? momentByPath(MOMENT_ORDER[index + 1])
    : undefined;
  if (previous) {
    links.push({ href: previous.path, label: previous.label, note: "Föregående moment" });
  }
  if (next) {
    links.push({ href: next.path, label: next.label, note: "Nästa moment" });
  }
  if (guide.path !== SUPERVISOR_GUIDE.path) {
    links.push({
      href: SUPERVISOR_GUIDE.path,
      label: "Handledare vid övningskörning",
      note: "Krav, ansvar och att vara flera",
    });
  }
  links.push({
    href: PLAN_PATH,
    label: "Planera övningskörning",
    note: "En möjlig ordning mellan momenten",
  });
  return `<ul class="official-links">${links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a> <span class="muted">— ${escapeHtml(link.note)}</span></li>`,
    )
    .join("")}</ul>`;
}

function guideDocument(
  guide: { path: string; documentTitle: string; description: string; h1: string },
  breadcrumbs: BreadcrumbItem[],
  body: string,
  consent: boolean,
): string {
  return siteLayout(guide.h1, body, {
    description: guide.description,
    path: guide.path,
    documentTitle: guide.documentTitle,
    consent,
    ogType: "article",
    jsonLd: articlePageJsonLd({
      path: guide.path,
      headline: guide.h1,
      description: guide.description,
      breadcrumbs,
    }),
  });
}

function pageShell(inner: string, consent: boolean): string {
  return `${siteHeader()}
     <main>
       <article class="site-section site-section--cream">
         <div class="site-inner site-inner--narrow legal">
           ${inner}
         </div>
       </article>
     </main>
     ${siteFooter({ cookieSettings: consent })}`;
}

function tsLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
}

function authorityLinks(): string {
  return `<ul class="official-links">
    <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.ovningskora, "Övningsköra")}</li>
    <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.handledare, "Handledare")}</li>
    <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.korkortstillstand, "Körkortstillstånd")}</li>
    <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.planera, "Planera övningskörningen")}</li>
  </ul>
  <p class="muted">Körpasset är inte Transportstyrelsens tjänst. Regler kan ändras. Läs originalet där.</p>`;
}

function renderSections(guide: StandaloneGuide): string {
  return guide.sections
    .map((section) => {
      const id = section.id ? ` id="${escapeHtml(section.id)}"` : "";
      const list = section.bullets ? bullets(section.bullets) : "";
      const steps = section.numbered ? numbered(section.numbered) : "";
      const links = section.links ? linkList(section.links) : "";
      return `<h2${id}>${escapeHtml(section.heading)}</h2>${paragraphs(section.paragraphs)}${list}${steps}${links}`;
    })
    .join("");
}

function renderFaqs(guide: StandaloneGuide): string {
  if (!guide.faqs?.length) return "";
  const items = guide.faqs
    .map(
      (item) =>
        `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`,
    )
    .join("");
  return `<h2>Vanliga frågor</h2>${items}`;
}

function renderRelated(guide: StandaloneGuide): string {
  if (!guide.related?.length) return "";
  return `<h2>Läs vidare</h2>${linkList(guide.related)}`;
}

function answerBox(answer: string | undefined): string {
  if (!answer) return "";
  return `<div class="info-box"><p>${escapeHtml(answer)}</p></div>`;
}

export function renderPracticeHub(consent = true): string {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Start", path: "/" },
    { name: PRACTICE_HUB.label, path: PRACTICE_HUB.path },
  ];
  const momentLinks = MOMENT_GUIDES.map(
    (guide) =>
      `<li><a href="${escapeHtml(guide.path)}">${escapeHtml(guide.h1)}</a> <span class="muted">— ${escapeHtml(guide.cardBlurb)}</span></li>`,
  ).join("");
  const inner = `${crumb(breadcrumbs)}
    <p class="eyebrow">${escapeHtml(PRACTICE_HUB.eyebrow)}</p>
    <h1>${escapeHtml(PRACTICE_HUB.h1)}</h1>
    <p class="lede">${escapeHtml(PRACTICE_HUB.lede)}</p>
    ${renderSections(PRACTICE_HUB)}
    <h2>Läs vidare</h2>
    <p>Varje länk tar en egen fråga: handledare, passagerare, förälder eller hur ni lägger upp passen.</p>
    ${linkList(PRACTICE_HUB.related ?? [])}
    <h2>Moment att öva</h2>
    <p>Varje guide är ett körpass: vad eleven bör kunna, vad du tittar efter, och när ni kan lämna momentet.</p>
    <ul class="official-links">${momentLinks}</ul>
    ${renderFaqs(PRACTICE_HUB)}
    <h2>Källor</h2>
    <p>Kraven på den här sidan kommer från Transportstyrelsen. Körpassets upplägg av passen är träningstips. Körpasset är inte Transportstyrelsens tjänst.</p>
    ${authorityLinks()}
    <h2>När ni vill hålla ihop passen</h2>
    <p>Eleven skapar en resa i Körpasset och bjuder in den som handleder. Då ligger planen och anteckningarna på samma ställe, även om ni turas om.</p>
    ${downloadCta()}`;
  return guideDocument(PRACTICE_HUB, breadcrumbs, pageShell(inner, consent), consent);
}

export function renderSupervisorPage(consent = true): string {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Start", path: "/" },
    { name: PRACTICE_HUB.label, path: HUB_PATH },
    { name: SUPERVISOR_GUIDE.label, path: SUPERVISOR_GUIDE.path },
  ];
  const inner = `${crumb(breadcrumbs)}
    <p class="eyebrow">${escapeHtml(SUPERVISOR_GUIDE.eyebrow)}</p>
    <h1>${escapeHtml(SUPERVISOR_GUIDE.h1)}</h1>
    <p class="lede">${escapeHtml(SUPERVISOR_GUIDE.lede)}</p>
    ${renderSections(SUPERVISOR_GUIDE)}
    ${renderFaqs(SUPERVISOR_GUIDE)}
    ${renderRelated(SUPERVISOR_GUIDE)}
    <h2>Källor</h2>
    <p>Ålder, körkortstid, giltighet och ansvar är Transportstyrelsens regler. Avsnitten om hur ni lägger upp passet är träningstips. Körpasset är inte Transportstyrelsens tjänst.</p>
    ${authorityLinks()}
    <h2>När anteckningen ska finnas kvar</h2>
    <p>Skriv vad ni övade och vad nästa handledare ska ta. Eleven kan samla det i Körpasset.</p>
    ${downloadCta()}`;
  return guideDocument(SUPERVISOR_GUIDE, breadcrumbs, pageShell(inner, consent), consent);
}

export function renderMomentGuide(guide: MomentGuide, consent = true): string {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Start", path: "/" },
    { name: PRACTICE_HUB.label, path: HUB_PATH },
    { name: guide.label, path: guide.path },
  ];
  const inner = `${crumb(breadcrumbs)}
    <p class="eyebrow">Moment</p>
    <h1>${escapeHtml(guide.h1)}</h1>
    <p class="lede">${escapeHtml(guide.intro)}</p>
    <h2>Vad eleven bör kunna</h2>
    ${bullets(guide.studentCan)}
    <h2>Vad handledaren ska observera</h2>
    ${bullets(guide.supervisorWatches)}
    <h2>Så kan ni öva</h2>
    ${numbered(guide.steps)}
    <h2>Vanliga misstag</h2>
    ${bullets(guide.mistakes)}
    <h2>När ni kan gå vidare</h2>
    <p>${escapeHtml(guide.readyWhen)}</p>
    <h2>Efter passet</h2>
    <p>${escapeHtml(guide.cta)}</p>
    ${downloadCta()}
    <h2>Närliggande moment</h2>
    ${nearbyLinks(guide)}
    <p class="muted">Det här är ett träningsupplägg. Vad som krävs för att få övningsköra privat står hos Transportstyrelsen och är samlat i <a href="${HUB_PATH}">guiden om övningskörning</a>.</p>`;
  return guideDocument(guide, breadcrumbs, pageShell(inner, consent), consent);
}

function consentFrom(request: FastifyRequest): boolean {
  return wantsPublicCookieConsent(request);
}

function renderClusterGuide(guide: StandaloneGuide, consent = true): string {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Start", path: "/" },
    { name: PRACTICE_HUB.label, path: HUB_PATH },
    { name: guide.label, path: guide.path },
  ];
  const inner = `${crumb(breadcrumbs)}
    <p class="eyebrow">${escapeHtml(guide.eyebrow)}</p>
    <h1>${escapeHtml(guide.h1)}</h1>
    ${answerBox(guide.answer)}
    <p class="lede">${escapeHtml(guide.lede)}</p>
    ${renderSections(guide)}
    ${renderFaqs(guide)}
    ${renderRelated(guide)}
    <h2>Källor</h2>
    <p>Reglerna på sidan kommer från Transportstyrelsen. Upplägget av passen är Körpassets träningstips. Körpasset är inte Transportstyrelsens tjänst.</p>
    ${authorityLinks()}
    <p>Vill ni samla vad ni övade mellan passen kan eleven bjuda in handledaren i Körpasset.</p>
    ${downloadCta()}`;
  return guideDocument(guide, breadcrumbs, pageShell(inner, consent), consent);
}

function registerHtmlRoute(
  app: FastifyInstance,
  path: string,
  render: (consent: boolean) => string,
): void {
  app.get(path, async (request, reply) => {
    return reply.type("text/html").send(render(consentFrom(request)));
  });
  app.get(`${path}/`, async (_request, reply) => {
    return reply.redirect(path, 301);
  });
}

export async function registerGuideRoutes(app: FastifyInstance): Promise<void> {
  for (const redirect of LEGACY_GUIDE_REDIRECTS) {
    app.get(redirect.from, async (_request, reply) => {
      return reply.redirect(redirect.to, 301);
    });
    app.get(`${redirect.from}/`, async (_request, reply) => {
      return reply.redirect(redirect.to, 301);
    });
  }

  registerHtmlRoute(app, HUB_PATH, renderPracticeHub);
  registerHtmlRoute(app, SUPERVISOR_PATH, renderSupervisorPage);
  for (const guide of CLUSTER_GUIDES) {
    registerHtmlRoute(app, guide.path, (consent) => renderClusterGuide(guide, consent));
  }
  for (const guide of MOMENT_GUIDES) {
    registerHtmlRoute(app, guide.path, (consent) => renderMomentGuide(guide, consent));
  }
}
