import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { wantsPublicCookieConsent } from "../auth/session.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { EmailSendError, notifyAndroidPlaySignup } from "../services/email.js";
import { saveAndroidNotify } from "../services/interest.js";
import { parseCampaignEvent, recordCampaignEvent } from "../services/campaign-events.js";
import {
  campaignSearch,
  campaignSearchFromSources,
  heroVariantFromQuery,
  readCampaignQuery,
  type CampaignQuery,
  type HeroVariant,
} from "./campaign-query.js";
import { APP_STORE_URL, PLAY_STORE_URL } from "./landing.js";
import { BRAND_ASSETS, escapeHtml, siteLayout } from "./layout.js";
import {
  ANDROID_NOTIFY_RATE_LIMIT,
  CAMPAIGN_EVENT_RATE_LIMIT,
  allowRequest,
} from "./rate-limit.js";

/**
 * /kom-igang is a campaign page, not an SEO page and not a door into /app.
 * noindex keeps it from competing with the homepage. The logo and
 * “Förstasidan” still link to /. Guides stay off this page. The native app
 * never loads the campaign script: the page omits it when the native cookie is set.
 */
export const KOM_IGANG_PATH = "/kom-igang";

export const HERO_HEADLINES: Record<HeroVariant, string> = {
  a: "Vet ni vad ni ska öva på nästa körpass?",
  b: "Slipp börja varje körpass med ”vad ska vi träna på idag?”",
  c: "All er privata övningskörning på ett ställe",
};

const SUBHEAD =
  "Körpasset hjälper elev och handledare att planera nästa pass, komma ihåg vad ni tränat på och följa utvecklingen mot körkortet.";

const PAGE_DESCRIPTION =
  "Planera nästa körpass, kom ihåg vad ni tränat på och dela samma historik mellan handledare. Gratis under betaperioden.";

const ANDROID_SAVED = "Klart. Vi mejlar när Körpasset finns på Google Play.";

const DONE_TOKEN = /^[A-Za-z0-9_-]{8,32}$/;

function pageHref(path: string, search: string): string {
  return escapeHtml(`${path}${search}`);
}

function personIcon(): string {
  return `<svg class="go-avatar__icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M6.2 18.2c1.2-2.4 3-3.6 5.8-3.6s4.6 1.2 5.8 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function campaignFields(campaign: CampaignQuery): string {
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "utm_id",
    "fbclid",
    "h",
  ] as const;
  return keys
    .map((key) => {
      const value = campaign[key];
      if (!value) return "";
      return `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`;
    })
    .join("");
}

function storeLink(options: {
  kind: "store" | "play";
  placement: string;
  label: string;
  href: string;
  className?: string;
}): string {
  const className = options.className ?? "btn btn-primary";
  return `<a class="${className}" href="${options.href}" rel="noopener noreferrer" data-cta-kind="${options.kind}" data-cta-placement="${options.placement}">${escapeHtml(options.label)}</a>`;
}

function installActions(
  placement: "hero" | "product" | "final",
  playLive: boolean,
  androidHtml = "",
): string {
  const primary = storeLink({
    kind: "store",
    placement,
    label: "Hämta Körpasset för iPhone",
    href: APP_STORE_URL,
  });
  const secondary = playLive
    ? `${storeLink({
        kind: "play",
        placement,
        label: "Hämta på Google Play",
        href: PLAY_STORE_URL,
        className: "btn btn-secondary go-store-secondary",
      })}
      <p class="go-note">Finns på Google Play</p>`
    : `${androidHtml || `<a class="go-android-link" href="#android-notify" data-cta-kind="android" data-cta-placement="${placement}">Android – meddela mig när appen finns</a>`}
      <p class="go-note">Google Play väntar på godkännande</p>`;
  return `<div class="go-actions">
    ${primary}
    <p class="go-note">Finns i App Store</p>
    ${secondary}
  </div>`;
}

function androidForm(options: {
  id: string;
  emailId: string;
  placement: "hero" | "final";
  search: string;
  campaign: CampaignQuery;
  email: string;
  errorMessage?: string;
  saved: boolean;
}): string {
  if (options.saved) {
    return `<div class="go-android go-android--saved" id="${options.id}">
      <p class="go-success" role="status">${ANDROID_SAVED}</p>
    </div>`;
  }
  const invalid = options.errorMessage ? ` aria-invalid="true" aria-describedby="${options.emailId}-error"` : "";
  const error = options.errorMessage
    ? `<p class="go-error" id="${options.emailId}-error" role="alert">${escapeHtml(options.errorMessage)}</p>`
    : "";
  const open = options.errorMessage ? " open" : "";
  return `<details class="go-android" id="${options.id}"${open}>
    <summary data-cta-kind="android" data-cta-placement="${options.placement}">Android – meddela mig när appen finns</summary>
    <form class="go-form" method="post" action="${pageHref(`${KOM_IGANG_PATH}/android`, options.search)}" data-android-form novalidate>
      <div class="hp" aria-hidden="true">
        <label for="${options.emailId}-website">Webbplats</label>
        <input id="${options.emailId}-website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>
      ${campaignFields(options.campaign)}
      ${error}
      <div data-android-fields>
        <label for="${options.emailId}">E-post</label>
        <input id="${options.emailId}" name="email" type="email" inputmode="email" autocomplete="email" maxlength="120" required spellcheck="false" value="${escapeHtml(options.email)}"${invalid}>
        <button type="submit" class="go-submit">Meddela mig</button>
        <p class="go-fine">Vi använder mejlen bara för att säga till när appen finns. <a href="${pageHref("/integritet", options.search)}">Integritet</a></p>
      </div>
      <p class="go-success" data-android-success hidden role="status">${ANDROID_SAVED}</p>
    </form>
  </details>`;
}

function phonePreview(): string {
  return `<aside class="go-phone" aria-label="Exempel från Körpasset: nästa körpass med cirkulationsplats, spegelrutin och väjningsplikt">
    <div class="go-phone__screen">
      <p class="go-phone__brand">Körpasset</p>
      <p class="go-phone__title">Nästa körpass</p>
      <p class="go-kicker">Nästa fokus</p>
      <ol class="go-focus">
        <li>Cirkulationsplats</li>
        <li>Spegelrutin</li>
        <li>Väjningsplikt</li>
      </ol>
      <div class="go-phone__past">
        <p class="go-kicker">Förra passet</p>
        <p>Parkering <strong>Självständigt</strong></p>
        <p>Högerregel <strong>Med påminnelse</strong></p>
      </div>
    </div>
  </aside>`;
}

function productCard(): string {
  return `<div class="go-product" aria-label="Ett körpass i Körpasset">
    <p class="go-product__brand">Körpasset</p>
    <h3>Dagens fokus</h3>
    <ol class="go-focus go-focus--light">
      <li>Infart i cirkulationsplats</li>
      <li>Spegelrutin</li>
      <li>Högerregel</li>
    </ol>
    <h3>Efter körningen</h3>
    <p>Infart i cirkulationsplats <strong>Med påminnelse</strong></p>
    <p>Spegelrutin <strong>Utan hjälp</strong></p>
    <h3>Nästa gång</h3>
    <p class="go-product__next">Trafikljus · Döda vinkeln · Väjningsplikt</p>
  </div>`;
}

export function renderKomIgangPage(options: {
  consent?: boolean;
  query?: unknown;
  email?: string;
  errorMessage?: string;
  androidSaved?: boolean;
  doneToken?: string;
} = {}): string {
  const campaign = readCampaignQuery(options.query);
  const search = campaignSearch(campaign);
  const variant = heroVariantFromQuery(campaign);
  const headline = HERO_HEADLINES[variant];
  const playLive = config.androidPlayLive;
  const saved = Boolean(options.androidSaved);
  const email = options.email ?? "";
  const track = options.consent !== false;
  const done = options.doneToken && DONE_TOKEN.test(options.doneToken) ? options.doneToken : "";
  const heroAndroid = playLive
    ? ""
    : androidForm({
        id: "android-notify",
        emailId: "android-email",
        placement: "hero",
        search,
        campaign,
        email,
        errorMessage: options.errorMessage,
        saved,
      });
  const finalAndroid = playLive
    ? ""
    : androidForm({
        id: "android-final",
        emailId: "android-email-final",
        placement: "final",
        search,
        campaign,
        email,
        errorMessage: options.errorMessage,
        saved,
      });

  const body = `<div class="go" data-variant="${variant}" data-play-live="${playLive ? "1" : "0"}" data-play-url="${escapeHtml(PLAY_STORE_URL)}"${done ? ` data-android-done="${escapeHtml(done)}"` : ""}>
    <a class="go-skip" href="#innehall">Hoppa till innehållet</a>
    <header class="go-bar">
      <a class="site-logo" href="${pageHref("/", search)}"><img src="${BRAND_ASSETS.logo}" alt="Körpasset" width="108" height="30"></a>
      <a class="go-home" href="${pageHref("/", search)}">Förstasidan</a>
    </header>
    <main id="innehall">
      <section class="go-hero" aria-labelledby="go-h1">
        <div class="go-inner go-hero__grid">
          <div class="go-hero__copy">
            <p class="eyebrow">Privat övningskörning · B-körkort</p>
            <h1 id="go-h1">${escapeHtml(headline)}</h1>
            <p class="lede">${SUBHEAD}</p>
            <ul class="go-benefits">
              <li>Planera nästa körpass</li>
              <li>Logga vad ni tränat på</li>
              <li>Flera handledare delar samma historik</li>
            </ul>
            <p class="go-free">Gratis under betaperioden</p>
            ${installActions("hero", playLive, heroAndroid)}
          </div>
          ${phonePreview()}
        </div>
      </section>

      <section class="go-section go-section--navy" aria-labelledby="go-messy">
        <div class="go-inner go-inner--narrow">
          <h2 id="go-messy">Privat övningskörning blir lätt rörig</h2>
          <p>Man kör med olika handledare. Det går några dagar mellan passen. Någon minns vad ni tränade på – någon annan gör det inte. Och inför nästa körning börjar frågan om igen: vad ska vi öva på idag?</p>
          <p class="go-pull">Körpasset samlar allt på samma ställe.</p>
          <p>Vad ni har tränat på.<br>Hur det gick.<br>Vad ni ska fokusera på nästa gång.</p>
        </div>
      </section>

      <section class="go-section" aria-labelledby="go-steps">
        <div class="go-inner">
          <h2 id="go-steps">Från ”vad ska vi träna på?” till ett tydligt nästa pass</h2>
          <ol class="go-steps">
            <li>
              <p class="go-steps__num">1</p>
              <h3>Planera</h3>
              <p><strong>Välj 2–3 saker att fokusera på innan ni kör.</strong></p>
              <ul>
                <li>parkering</li>
                <li>cirkulationsplats</li>
                <li>växling</li>
              </ul>
            </li>
            <li>
              <p class="go-steps__num">2</p>
              <h3>Kör och följ upp</h3>
              <p><strong>Efter passet markerar ni kort hur det gick.</strong></p>
              <p>Inte en lång körjournal. Inte administration.</p>
            </li>
            <li>
              <p class="go-steps__num">3</p>
              <h3>Se nästa steg</h3>
              <p><strong>Nästa handledare ser direkt vad eleven redan tränat på och vad som behöver mer övning.</strong></p>
            </li>
          </ol>
        </div>
      </section>

      <section class="go-section go-section--white" aria-labelledby="go-shared">
        <div class="go-inner go-shared">
          <div>
            <h2 id="go-shared">En elev. Flera handledare. Samma körkortsresa.</h2>
            <p>Mamma kör på måndag. Pappa på torsdag. Ett syskon eller en annan handledare på helgen. Alla ser samma historik och samma nästa steg.</p>
          </div>
          <div class="go-people" aria-hidden="true">
            <ul>
              <li><span class="go-avatar">${personIcon()}</span> Mamma</li>
              <li><span class="go-avatar">${personIcon()}</span> Pappa</li>
              <li><span class="go-avatar">${personIcon()}</span> Syskon</li>
            </ul>
            <p class="go-people__plan">Samma körkortsresa</p>
          </div>
        </div>
      </section>

      <section class="go-section" aria-labelledby="go-product">
        <div class="go-inner go-product-layout">
          <div>
            <h2 id="go-product">Så kan ett körpass se ut</h2>
            ${productCard()}
          </div>
          <div class="go-product-cta">
            <p class="go-free">Gratis under betaperioden</p>
            ${installActions("product", playLive)}
          </div>
        </div>
      </section>

      <section class="go-section go-section--white" aria-labelledby="go-easy">
        <div class="go-inner">
          <h2 id="go-easy">Ingen extra administration</h2>
          <ul class="go-points">
            <li>Tar bara någon minut efter körpasset</li>
            <li>Fungerar med flera handledare</li>
            <li>Eleven äger sin körkortsresa</li>
            <li>Gratis under betan</li>
          </ul>
        </div>
      </section>

      <section class="go-section" aria-labelledby="go-who">
        <div class="go-inner">
          <h2 id="go-who">För er som övningskör privat</h2>
          <div class="go-who">
            <article>
              <h3>Ni har precis börjat</h3>
              <p>Ni behöver hjälp att veta vad nästa körpass ska innehålla.</p>
            </article>
            <article>
              <h3>Ni har hållit på ett tag</h3>
              <p>Ni vill slippa glömma vad ni redan tränat på.</p>
            </article>
            <article>
              <h3>Flera turas om att vara handledare</h3>
              <p>Alla behöver samma bild av elevens utveckling.</p>
            </article>
          </div>
        </div>
      </section>

      <section class="go-section go-section--white" aria-labelledby="go-built">
        <div class="go-inner go-inner--narrow">
          <h2 id="go-built">Byggt för riktig privat övningskörning</h2>
          <p>Körpasset är utvecklat i Sverige för elever och handledare som övningskör privat för B-körkort.</p>
          <ul class="go-points">
            <li>Inte en teoriapp.</li>
            <li>Inte ett officiellt bedömningssystem.</li>
            <li>Ett praktiskt stöd mellan körpassen.</li>
          </ul>
        </div>
      </section>

      <section class="go-section" aria-labelledby="go-beta">
        <div class="go-inner go-inner--narrow">
          <h2 id="go-beta">Testa gratis medan vi utvecklar Körpasset</h2>
          <p>Körpasset är fortfarande i betafas. Därför kan du använda appen gratis just nu och hjälpa oss göra den ännu bättre.</p>
          <p class="go-fine">Ingen betalning krävs under betaperioden.</p>
        </div>
      </section>

      <section class="go-section go-section--final" aria-labelledby="go-final">
        <div class="go-inner go-inner--narrow go-final">
          <h2 id="go-final">Gör nästa körpass lite enklare</h2>
          <p>Samla planen, körpassen och nästa steg på ett ställe.</p>
          ${playLive ? installActions("final", true) : `<div class="go-actions">
            ${storeLink({ kind: "store", placement: "final", label: "Hämta Körpasset för iPhone", href: APP_STORE_URL })}
            <p class="go-note">Finns i App Store</p>
            ${finalAndroid}
            <p class="go-note">Google Play väntar på godkännande</p>
          </div>`}
          <p class="go-free go-free--light">Gratis under betaperioden</p>
        </div>
      </section>
    </main>
    <footer class="go-footer">
      <div class="go-inner go-footer__row">
        <p>Körpasset / Papa Bravo AB</p>
        <nav aria-label="Sidfot">
          <a href="${pageHref("/", search)}">Förstasidan</a>
          <a href="${pageHref("/integritet", search)}">Integritet</a>
          <a href="${pageHref("/villkor", search)}">Villkor</a>
          <a href="${pageHref("/kontakt", search)}">Kontakt</a>
        </nav>
      </div>
    </footer>
    <div class="go-sticky" data-go-sticky hidden>
      <p>Gratis under betan</p>
      <a class="btn btn-primary" href="${APP_STORE_URL}" rel="noopener noreferrer" data-cta-kind="store" data-cta-placement="sticky">Hämta appen</a>
    </div>
  </div>
  ${track ? `<script src="/kom-igang.js" defer></script>` : ""}`;

  return siteLayout(headline, body, {
    description: PAGE_DESCRIPTION,
    path: KOM_IGANG_PATH,
    documentTitle: `${headline} · Körpasset`,
    robots: "noindex, nofollow",
    extraCss: ["/kom-igang.css"],
    consent: track,
  });
}

function queryValue(query: unknown, key: string): string {
  if (!query || typeof query !== "object") return "";
  const value = (query as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function formEmail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as Record<string, unknown>).email;
  return typeof email === "string" ? email : "";
}

function formHoneypot(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const website = (body as Record<string, unknown>).website;
  return typeof website === "string" ? website : "";
}

function doneToken(): string {
  return randomBytes(9).toString("base64url");
}

function savedLocation(query: unknown, body: unknown, token: string): string {
  const search = campaignSearchFromSources(query, body);
  const joiner = search ? "&" : "?";
  return `${KOM_IGANG_PATH}${search}${joiner}android=klart&done=${token}`;
}

function sendPage(
  reply: FastifyReply,
  request: FastifyRequest,
  options: {
    email?: string;
    errorMessage?: string;
    androidSaved?: boolean;
    doneToken?: string;
    status?: number;
  } = {},
): FastifyReply {
  return reply
    .status(options.status ?? 200)
    .header("cache-control", "private, no-store")
    .header("x-robots-tag", "noindex, nofollow")
    .type("text/html")
    .send(
      renderKomIgangPage({
        consent: wantsPublicCookieConsent(request),
        query: request.query,
        email: options.email,
        errorMessage: options.errorMessage,
        androidSaved: options.androidSaved,
        doneToken: options.doneToken,
      }),
    );
}

function wantsJson(request: FastifyRequest): boolean {
  return (request.headers.accept ?? "").includes("application/json");
}

export async function registerKomIgangRoutes(app: FastifyInstance): Promise<void> {
  app.get(KOM_IGANG_PATH, async (request, reply) => {
    const saved = queryValue(request.query, "android") === "klart";
    const token = queryValue(request.query, "done");
    return sendPage(reply, request, {
      androidSaved: saved,
      doneToken: DONE_TOKEN.test(token) ? token : "",
    });
  });

  app.post(`${KOM_IGANG_PATH}/android`, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const email = formEmail(body);
    const json = wantsJson(request);

    if (
      !allowRequest(
        `android-notify:${request.ip || "unknown"}`,
        ANDROID_NOTIFY_RATE_LIMIT.limit,
        ANDROID_NOTIFY_RATE_LIMIT.windowMs,
      )
    ) {
      const message = "För många försök. Vänta en stund och prova igen.";
      if (json) return reply.status(429).send({ ok: false, message });
      return sendPage(reply, request, { email, errorMessage: message, status: 429 });
    }

    try {
      const result = await saveAndroidNotify({
        email,
        honeypot: formHoneypot(body),
      });
      if (result?.created) {
        try {
          await notifyAndroidPlaySignup(result.signup, true);
        } catch (error) {
          if (error instanceof EmailSendError) {
            request.log.error({ err: error }, "android notify mailer failed");
          } else {
            request.log.error({ err: error }, "android notify failed");
          }
        }
      }
      const token = doneToken();
      if (json) return reply.send({ ok: true, done: token });
      return reply.redirect(savedLocation(request.query, body, token));
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "Kunde inte spara mejladressen.";
      if (json) return reply.status(400).send({ ok: false, message });
      return sendPage(reply, request, { email, errorMessage: message, status: 400 });
    }
  });

  app.post(`${KOM_IGANG_PATH}/event`, async (request, reply) => {
    if (
      !allowRequest(
        `campaign-event:${request.ip || "unknown"}`,
        CAMPAIGN_EVENT_RATE_LIMIT.limit,
        CAMPAIGN_EVENT_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).send({ ok: false });
    }
    const event = parseCampaignEvent(request.body);
    if (!event) return reply.status(400).send({ ok: false });
    try {
      await recordCampaignEvent(event);
    } catch (error) {
      request.log.error({ err: error }, "campaign event failed");
      return reply.status(500).send({ ok: false });
    }
    return reply.status(204).send();
  });
}
