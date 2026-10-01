import type { FastifyInstance, FastifyRequest } from "fastify";
import { wantsPublicCookieConsent } from "../auth/session.js";
import {
  HUB_PATH,
  MOMENT_GUIDES,
  MOMENT_ORDER,
  PRACTICE_HUB,
  SUPERVISOR_GUIDE,
  SUPERVISOR_PATH,
  momentByPath,
  type MomentGuide,
  type StandaloneGuide,
} from "./guide-content.js";
import {
  TESTFLIGHT_JOIN_URL,
  TRANSPORTSTYRELSEN_LINKS,
  siteFooter,
  siteHeader,
} from "./landing.js";
import { escapeHtml, siteLayout } from "./layout.js";
import { articlePageJsonLd, type BreadcrumbItem } from "./seo.js";

function bullets(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function numbered(items: string[]): string {
  return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
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
    <p class="muted">På iPhone går det via <a href="${TESTFLIGHT_JOIN_URL}" rel="noopener noreferrer">TestFlight</a>. På Android lämnar du mejl tills öppet test finns.</p>`;
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
      label: "För handledaren",
      note: "Planering, återkoppling och att vara flera",
    });
  }
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
      const list = section.bullets ? bullets(section.bullets) : "";
      return `<h2>${escapeHtml(section.heading)}</h2>${paragraphs(section.paragraphs)}${list}`;
    })
    .join("");
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
    <h2>Moment att öva</h2>
    <p>Varje guide är ett körpass: vad eleven bör kunna, vad du tittar efter, och när ni kan lämna momentet.</p>
    <ul class="official-links">${momentLinks}</ul>
    <p>Ska du sitta bredvid finns också <a href="${SUPERVISOR_PATH}">sidan för handledare</a>.</p>
    <h2>Vad myndigheten kräver</h2>
    <p>Tipsen ovan är Körpassets sätt att lägga upp träningen. De är inte villkor för att få övningsköra. Det som gäller formellt läser ni hos Transportstyrelsen:</p>
    ${authorityLinks()}
    <h2>När ni vill hålla ihop passen</h2>
    <p>Eleven skapar en resa i Körpasset och bjuder in den som handleder. Då ligger planen och anteckningarna på samma ställe, även om ni turas om.</p>
    ${downloadCta()}`;
  return guideDocument(PRACTICE_HUB, breadcrumbs, pageShell(inner, consent), consent);
}

export function renderSupervisorPage(consent = true): string {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Start", path: "/" },
    { name: SUPERVISOR_GUIDE.label, path: SUPERVISOR_GUIDE.path },
  ];
  const inner = `${crumb(breadcrumbs)}
    <p class="eyebrow">${escapeHtml(SUPERVISOR_GUIDE.eyebrow)}</p>
    <h1>${escapeHtml(SUPERVISOR_GUIDE.h1)}</h1>
    <p class="lede">${escapeHtml(SUPERVISOR_GUIDE.lede)}</p>
    ${renderSections(SUPERVISOR_GUIDE)}
    <h2>Myndighetskrav, inte Körpassets råd</h2>
    <p>Vem som får vara handledare, vad eleven behöver och hur privat övningskörning får gå till bestäms inte här. Läs det hos Transportstyrelsen och håll det isär från träningstipsen ovan.</p>
    ${authorityLinks()}
    <h2>Pass att ta med ut</h2>
    <p>När rollen är tydlig är nästa steg ett konkret moment. Börja i <a href="${HUB_PATH}">guiden om privat övningskörning</a>, eller gå direkt till ett pass:</p>
    <ul class="official-links">
      <li><a href="/ovningskora/forsta-gangen">Första gången ni övningskör</a></li>
      <li><a href="/ovningskora/hogerregeln">Högerregeln</a></li>
      <li><a href="/ovningskora/rondell">Rondell</a></li>
    </ul>
    <h2>Efter passet</h2>
    <p>Skriv vad ni övade och vad nästa handledare ska ta. Det är det Körpasset är till för.</p>
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

export async function registerGuideRoutes(app: FastifyInstance): Promise<void> {
  app.get(HUB_PATH, async (request, reply) => {
    return reply.type("text/html").send(renderPracticeHub(consentFrom(request)));
  });

  app.get(SUPERVISOR_PATH, async (request, reply) => {
    return reply.type("text/html").send(renderSupervisorPage(consentFrom(request)));
  });

  for (const guide of MOMENT_GUIDES) {
    app.get(guide.path, async (request, reply) => {
      return reply.type("text/html").send(renderMomentGuide(guide, consentFrom(request)));
    });
  }
}
