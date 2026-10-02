import { type InterestRole } from "../services/interest.js";
import { BRAND_ASSETS, escapeHtml, errorBanner, primaryButton, siteLayout } from "./layout.js";
import { HOME_GUIDE_CARDS, HUB_PATH, SUPERVISOR_PATH } from "./guide-content.js";
import {
  publicPageJsonLd,
  SITE_DESCRIPTION,
  type FaqItem,
} from "./seo.js";

const BRAND_TAGLINE = "ÖVNING IDAG. FRIHET IMORGON.";

function siteLogo(href = "/"): string {
  return `<a class="site-logo" href="${escapeHtml(href)}"><img src="${BRAND_ASSETS.logo}" alt="Körpasset"></a>`;
}

const ROLE_LABELS: Record<InterestRole, string> = {
  parent: "Förälder / vårdnadshavare",
  student: "Elev",
  supervisor: "Handledare",
  other: "Annat",
};

export const TESTFLIGHT_JOIN_URL = "https://testflight.apple.com/join/MjyuvkzB";

export const APP_STORE_URL = "https://apps.apple.com/se/app/korpasset/id6814100094";

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=se.korpasset.app";

export const TRANSPORTSTYRELSEN_LINKS = {
  ovningskora:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/ovningskora/",
  handledare:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/handledare/",
  korkortstillstand:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/korkortstillstand/",
  planera:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/planera-ovningsskorningen/",
  personbilB:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/valj-behorighet/personbil-och-latt-lastbil/b-personbil-och-latt-lastbil/",
} as const;

const LANDING_DESCRIPTION = SITE_DESCRIPTION;
const LANDING_DOCUMENT_TITLE = "Körpasset – övningskörning för att ta körkort";

function tsLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a>`;
}

function testFlightButton(label: string): string {
  return `<a class="btn btn-primary" href="${TESTFLIGHT_JOIN_URL}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

const LANDING_FAQ: Array<FaqItem & { answerHtml?: string }> = [
  {
    question: "Vad är Körpasset?",
    answer:
      "Ett enkelt stöd för privat övningskörning när ni ska ta körkort. Körkortselev och handledare håller koll på vad ni har tränat på, dokumenterar körpassen och ser utvecklingen över tid.",
  },
  {
    question: "Vem kan bli betatestare?",
    answer:
      "Elever, handledare och föräldrar som övningskör privat mot B-körkort. På iPhone laddar du ner betan via TestFlight. På Android lämnar du mejl tills Google öppnat för öppet test — en anmälan ger inte automatisk access.",
  },
  {
    question: "Hur laddar jag ner Körpasset?",
    answer:
      "På iPhone via TestFlight: https://testflight.apple.com/join/MjyuvkzB. På Android lämnar du din mejladress tills Google öppnat för öppet test. Vi väntar på granskning.",
    answerHtml: `På iPhone via <a href="${TESTFLIGHT_JOIN_URL}" rel="noopener noreferrer">TestFlight</a>. På Android lämnar du din mejladress tills Google öppnat för öppet test. Vi väntar på granskning.`,
  },
  {
    question: "Kostar betan något?",
    answer:
      "Nej. Körpasset är gratis under betan. En anmälan är inget löfte om livstidsfri användning, och betalning införs inte via den här sidan.",
  },
  {
    question: "Kan jag ha flera handledare?",
    answer:
      "Ja. Mamma och pappa, partner, ett syskon eller någon annan godkänd handledare. Samma elevresa, gemensam historik. Nästa körpass kan fortsätta där det förra slutade.",
  },
  {
    question: "Vi har redan övningskört ett tag — är det för sent?",
    answer:
      "Nej. Många som skriver upp sig har kört i månader. Körpasset hjälper er välja nästa fokus, inte bara första lektionen.",
  },
  {
    question: "Kan Körpasset hjälpa oss träna inför körkort och uppkörning?",
    answer:
      "Ja som struktur för träningen. Körpasset hjälper handledare och körkortselev att se vad som är bra att öva på nästa gång. Det bedömer inte om eleven är redo för uppkörning och garanterar inte körkort.",
  },
  {
    question: "Ersätter Körpasset en trafikskola?",
    answer:
      "Nej. Körpasset ersätter inte trafikskola, bedömer inte om eleven är redo för uppkörning och garanterar inte körkort. Det är ett stöd för att hålla ihop den privata träningen.",
  },
  {
    question: "Behöver eleven körkortstillstånd för att övningsköra?",
    answer:
      "Ja. För privat övningskörning behöver eleven ett giltigt körkortstillstånd och en godkänd handledare. Körpasset är inte Transportstyrelsens tjänst — kontrollera alltid gällande regler där.",
  },
  {
    question: "Hur hjälper Körpasset handledare under övningskörningen?",
    answer:
      "Som handledare för körkort får du samma historik som eleven, plus en handledarguide i appen: vad du tittar efter, hur du coachar och en fråga att ta med eleven. Efter körpasset ser ni hur det gick och vad som är nästa fokus. Flera handledare kan turas om utan att tappa tråden.",
  },
  {
    question: "Jag är förälder och hittade Körpasset — hur kommer vi igång?",
    answer:
      "Du kan sätta igång utan att bli eleven. I appen väljer du handledare eller förälder och skickar länken till den som tar körkort. Eleven skapar sin körkortsresa och bjuder in dig. Resan tillhör eleven.",
  },
  {
    question: "Jag är vuxen och övningskör med min partner — är Körpasset för oss?",
    answer:
      "Ja. Många som skriver upp sig är vuxna elever, inte bara 16-åringar. Partner, sambo eller förälder kan vara handledare. Eleven skapar resan och bjuder in.",
  },
  {
    question: "Kan jag följa två barn, eller både partner och barn?",
    answer:
      "Ja. En handledare kan vara med på flera körkortsresor. Varje elev har sin egen resa och historik. Du väljer vilken du öppnar.",
  },
  {
    question: "Vi kör för sällan — kan Körpasset hjälpa?",
    answer:
      "Ja som påminnelse att komma ut. Det svåra är ofta inte själva körningen, utan att faktiskt köra. Efter ett par dagar visar appen att det är dags för en ny runda.",
  },
  {
    question: "Var hittar jag de officiella reglerna för privat övningskörning?",
    answer:
      "Hos Transportstyrelsen. Börja med sidorna Övningsköra och Handledare. Körpasset är inte Transportstyrelsens tjänst.",
    answerHtml: `Hos Transportstyrelsen. Börja med ${tsLink(TRANSPORTSTYRELSEN_LINKS.ovningskora, "Övningsköra")} och ${tsLink(TRANSPORTSTYRELSEN_LINKS.handledare, "Handledare")}. Körpasset är inte Transportstyrelsens tjänst.`,
  },
];

export interface PublicConsentOptions {
  consent?: boolean;
  interestAction?: string;
}

export function renderLandingPage(options: {
  errorMessage?: string;
  consent?: boolean;
  interestAction?: string;
  values?: {
    name?: string;
    email?: string;
    role?: string;
    city?: string;
    message?: string;
    platformIos?: boolean;
    platformAndroid?: boolean;
  };
} = {}): string {
  const values = options.values ?? {};
  const formError = options.errorMessage
    ? `${errorBanner(options.errorMessage)}
       <script>
         document.addEventListener("DOMContentLoaded", function () {
           var interest = document.getElementById("intresse");
           var interestError = interest && interest.querySelector("[role='alert']");
           if (interestError) {
             interestError.setAttribute("tabindex", "-1");
             interestError.focus({ preventScroll: true });
           }
           if (interest && interest.scrollIntoView) interest.scrollIntoView();
         });
       </script>`
    : "";

  return siteLayout(
    "Övningskör med bättre koll",
    `${siteHeader()}
     <main>
       ${hero()}
       ${trafficPhotos()}
       ${howItWorks()}
       ${supervisorGuide()}
       ${practiceGuides()}
       ${whoItsFor()}
       ${whyItExists()}
       ${officialRules()}
       ${faq()}
       ${interestSection(formError, values, options.interestAction || "/interest")}
     </main>
     ${siteFooter({ cookieSettings: options.consent !== false })}`,
    {
      description: LANDING_DESCRIPTION,
      path: "/",
      documentTitle: LANDING_DOCUMENT_TITLE,
      consent: options.consent !== false,
      // FAQ stays visible in the page. FAQPage JSON-LD is omitted: Google retired that rich result in May 2026.
      jsonLd: publicPageJsonLd({
        path: "/",
        title: LANDING_DOCUMENT_TITLE,
        description: LANDING_DESCRIPTION,
        includeApp: true,
        appDownloadUrl: TESTFLIGHT_JOIN_URL,
      }),
    },
  );
}

export function renderInterestThanksPage(options: PublicConsentOptions = {}): string {
  return siteLayout(
    "Tack för din anmälan",
    `${siteHeader()}
     <main>
       <section class="site-section site-section--cream">
         <div class="site-inner site-inner--narrow">
           <p class="eyebrow">Betan</p>
           <h1>Tack — vi hör av oss.</h1>
           <p class="lede">Din intresseanmälan är inne. Vi skickar en bekräftelse till din mejladress och hör av oss när Android-testet är öppet — inte automatisk access.</p>
           <p>Har du iPhone kan du ladda ner appen direkt via <a href="${TESTFLIGHT_JOIN_URL}" rel="noopener noreferrer">TestFlight</a>.</p>
           <p><a class="btn-link" href="/">Tillbaka till startsidan</a></p>
         </div>
       </section>
     </main>
     ${siteFooter({ cookieSettings: options.consent !== false })}`,
    {
      description: "Tack för din intresseanmälan till Körpassets beta.",
      path: "/interest/tack",
      robots: "noindex, follow",
      consent: options.consent !== false,
    },
  );
}

export function renderLegalPage(
  title: string,
  body: string,
  path = "/",
  description?: string,
  options: PublicConsentOptions = {},
): string {
  const pageDescription = description ?? SITE_DESCRIPTION;
  const documentTitle = `${title} · Körpasset`;
  return siteLayout(
    title,
    `${siteHeader()}
     <main>
       <article class="site-section site-section--cream">
         <div class="site-inner site-inner--narrow legal">
           ${body}
         </div>
       </article>
     </main>
     ${siteFooter({ cookieSettings: options.consent !== false })}`,
    {
      path,
      description: pageDescription,
      consent: options.consent !== false,
      jsonLd: publicPageJsonLd({
        path,
        title: documentTitle,
        description: pageDescription,
      }),
    },
  );
}

export function siteHeader(
  options: {
    ctaHref?: string;
    variant?: "site" | "admin";
    signedIn?: boolean;
    adminNav?: "overview" | "signups" | "users" | "statistik" | "support";
  } = {},
): string {
  if (options.variant === "admin") {
    const current = (href: string, nav: string, label: string) =>
      `<a href="${href}"${options.adminNav === nav ? ' aria-current="page"' : ""}>${label}</a>`;
    const links = options.signedIn
      ? `<nav class="site-nav__links site-nav__links--admin" aria-label="Admin">
      ${current("/admin", "overview", "Översikt")}
      ${current("/admin/signups", "signups", "Intresseanmälningar")}
      ${current("/admin/users", "users", "Användare")}
      ${current("/admin/statistik", "statistik", "Statistik")}
      <form method="post" action="/admin/logout"><button type="submit" class="btn-link">Logga ut</button></form>
    </nav>`
      : "";
    return `<header class="site-nav">
    <a class="site-logo" href="/admin">Körpasset admin</a>
    ${links}
  </header>`;
  }

  const ctaHref = options.ctaHref ?? "/#intresse";
  return `<header class="site-nav">
    ${siteLogo("/")}
    <nav class="site-nav__links" aria-label="Huvudmeny">
      <a href="/#sa-funkar-det">Övningskörning</a>
      <a href="${HUB_PATH}">Guider</a>
      <a href="/#regler">Regler</a>
      <a href="/#intresse" class="site-nav__cta">Ladda ner</a>
    </nav>
    <a class="site-nav__cta site-nav__cta--mobile" href="${escapeHtml(ctaHref)}">Ladda ner</a>
  </header>`;
}

export function siteFooter(
  options: { cookiePolicy?: boolean; cookieSettings?: boolean } = {},
): string {
  const cookiePolicy =
    options.cookiePolicy === false ? "" : `<a href="/cookies">Cookies</a>`;
  const cookieSettings =
    options.cookieSettings === false
      ? ""
      : `<button type="button" class="consent-footer-link" data-consent-open>Cookieinställningar</button>`;
  return `<footer class="site-footer">
    <div class="site-inner site-footer__grid">
      <div>
        <p class="site-logo site-logo--footer">Körpasset</p>
        <p>Stöd för privat övningskörning när ni ska ta körkort.</p>
      </div>
      <div>
        <a href="${HUB_PATH}">Övningskörning</a>
        <a href="${SUPERVISOR_PATH}">Handledare</a>
        <a href="/integritet">Integritet</a>
        ${cookiePolicy}
        ${cookieSettings}
        <a href="/villkor">Villkor</a>
        <a href="/kontakt">Kontakt</a>
        <a href="/radera-konto">Radera konto</a>
        <a href="mailto:info@korpasset.se">info@korpasset.se</a>
      </div>
      <p class="muted">Körpasset är en fristående tjänst från Papa Bravo AB. Inte utvecklad av, ansluten till eller godkänd av Transportstyrelsen eller Trafikverket.</p>
    </div>
  </footer>`;
}

function hero(): string {
  return `<section class="hero">
    <div class="site-inner hero__grid">
      <div>
        <p class="eyebrow">Privat övningskörning · B-körkort</p>
        <h1>Övningskörning med bättre koll</h1>
        <p class="lede">Körpasset hjälper körkortselev och handledare att övningsköra med en plan — oavsett om ni just börjat eller redan kört ett år.</p>
        <p>Håll koll på vad ni har tränat på, dokumentera körpassen och samarbeta när mamma, pappa eller syskon turas om som handledare under övningskörningen. Ett stöd för att träna inför körkort och uppkörning. Eleven behöver körkortstillstånd.</p>
        <div class="hero__ctas">
          ${testFlightButton("Ladda ner för iPhone")}
          <a class="btn btn-secondary" href="#android">Lämna mejl för Android</a>
          <a class="btn-link" href="#sa-funkar-det">Så fungerar det</a>
        </div>
        <p class="hero__trust">Gratis under betan · iPhone via TestFlight · Android efter Googles granskning</p>
        <p class="hero__tagline">${BRAND_TAGLINE}</p>
      </div>
      ${heroCard()}
    </div>
  </section>`;
}

function trafficPhotos(): string {
  return `<section class="photo-strip" aria-label="Svensk övningskörning">
    <figure>
      <img src="/images/landing/residential-street.jpg" width="1280" height="720" alt="Körkortselev och handledare övningskör i sommarkväll" decoding="async" loading="lazy">
    </figure>
    <figure>
      <img src="/images/landing/roundabout.jpg" width="1280" height="720" alt="Övningskörning i en solig rondell i svenskt villaområde" decoding="async" loading="lazy">
    </figure>
    <figure>
      <img src="/images/landing/country-road.jpg" width="1280" height="720" alt="Träna inför körkort på öppen landsväg i kvällssol" decoding="async" loading="lazy">
    </figure>
  </section>`;
}

function heroCard(): string {
  return `<aside class="pass-card" aria-label="Exempel på ett körpass">
    <p class="pass-card__stamp">Körpasset</p>
    <h2>Dagens fokus</h2>
    <ol>
      <li>Infart i rondell</li>
      <li>Spegelrutin</li>
      <li>Högerregeln</li>
    </ol>
    <div class="pass-card__recap">
      <p class="pass-card__label">Så gick körpasset</p>
      <p>Infart i rondell — <strong>Med påminnelse</strong></p>
      <p>Spegelrutin — <strong>Utan hjälp</strong></p>
    </div>
    <div class="pass-card__next">
      <p class="pass-card__label">Nästa gång</p>
      <p>Trafikljus · Döda vinkeln · Väjningsplikt</p>
    </div>
  </aside>`;
}

function howItWorks(): string {
  return `<section class="site-section site-section--cream" id="sa-funkar-det">
    <div class="site-inner">
      <p class="eyebrow">Tre steg</p>
      <h2>Så fungerar Körpasset</h2>
      <ol class="steps">
        <li>
          <span class="steps__num">1</span>
          <div>
            <h3>Koppla ihop körkortselev och handledare</h3>
            <p>Eleven skapar resan och bjuder in via QR eller länk. En förälder kan skicka in eleven — resan skapas ändå av den som tar körkort. Mamma, pappa, partner, syskon eller någon annan godkänd handledare — flera kan dela samma historik. En handledare kan följa flera elever.</p>
          </div>
        </li>
        <li>
          <span class="steps__num">2</span>
          <div>
            <h3>Övningskör och följ upp</h3>
            <p>Ni väljer 2–3 moment att träna inför körkort, kör, och registrerar kort hur det gick efteråt.</p>
          </div>
        </li>
        <li>
          <span class="steps__num">3</span>
          <div>
            <h3>Se utvecklingen</h3>
            <p>Körpassen bygger upp en gemensam bild av vad körkortseleven har tränat på. Det är ett stöd för handledare, körkort och nästa pass — inte ett betyg inför uppkörning.</p>
          </div>
        </li>
      </ol>
    </div>
  </section>`;
}

function supervisorGuide(): string {
  return `<section class="site-section site-section--white" id="handledarguiden" aria-labelledby="guide-heading">
    <div class="site-inner site-inner--narrow">
      <p class="eyebrow">I bilen</p>
      <h2 id="guide-heading">En handledarguide som kommer ihåg</h2>
      <p class="lede">Många har en bok i handskfacket. Körpasset är den levande planen: samma sorts moment, men med era körpass, era bedömningar och nästa steg.</p>
      <ul class="rule-list">
        <li>Vad du tittar efter i varje moment.</li>
        <li>Hur du coachar utan att ta över ratten.</li>
        <li>En fråga att ta med eleven efteråt.</li>
        <li>Steg ni kan bocka av under körpasset.</li>
      </ul>
      <p>Det är träningsstöd, inte en teoriapp och inte ett officiellt körkortsresultat. Körpasset ersätter inte Transportstyrelsens regler och är inte någon annans handledarbok.</p>
      <p>Innan ni sätter er i bilen kan ni läsa <a href="${HUB_PATH}">guiden om privat övningskörning</a> och <a href="${SUPERVISOR_PATH}">vad handledaren kan tänka på</a>.</p>
    </div>
  </section>`;
}

function practiceGuides(): string {
  const cards = HOME_GUIDE_CARDS.map(
    (guide) => `<a class="value-card guide-card" href="${escapeHtml(guide.path)}">
          <h3>${escapeHtml(guide.cardTitle)}</h3>
          <p>${escapeHtml(guide.cardBlurb)}</p>
        </a>`,
  ).join("");
  return `<section class="site-section site-section--cream" id="guider" aria-labelledby="guider-heading">
    <div class="site-inner">
      <p class="eyebrow">Guider</p>
      <h2 id="guider-heading">Guider för övningskörning</h2>
      <p class="lede">Korta upplägg för körkortselev och handledare. Ett moment per pass, så ni vet vad ni ska titta efter.</p>
      <div class="card-grid">
        ${cards}
      </div>
      <p><a class="btn-link" href="${HUB_PATH}">Alla guider om övningskörning</a> · <a class="btn-link" href="${SUPERVISOR_PATH}">För handledare</a></p>
    </div>
  </section>`;
}

function whoItsFor(): string {
  return `<section class="site-section site-section--white" id="for-vem" aria-labelledby="for-vem-heading">
    <div class="site-inner site-inner--narrow">
      <p class="eyebrow">För körkort, elev och handledare</p>
      <h2 id="for-vem-heading">Privat övningskörning när ni ska ta körkort</h2>
      <p class="lede">Körpasset ger handledare körkortshistoriken och eleven en gemensam plan. Ni övningskör, tränar inför körkort och uppkörning, och ser vad nästa pass bör ta — även när flera turas om.</p>
      <p>Körkort elev och handledare ser samma körpass, samma fokus och samma nästa steg. Som handledare under övningskörningen ansvarar du i bilen. Körpasset ersätter inte det. Eleven behöver körkortstillstånd. Tjänsten bedömer inte om ni är redo för uppkörning.</p>
    </div>
  </section>`;
}

function whyItExists(): string {
  return `<section class="site-section site-section--navy" id="varfor">
    <div class="site-inner site-inner--narrow">
      <p class="eyebrow">Varför Körpasset</p>
      <h2>Få bättre struktur på övningskörningen</h2>
      <p class="lede">Privat övningskörning kan pågå länge och ske med flera olika personer. Det är lätt att tappa bort vad man redan tränat på, vad som fortfarande är svårt, vad nästa handledare bör fokusera på och hur eleven faktiskt utvecklas mot att ta körkort.</p>
      <p>En del har precis börjat. Andra har kört EPA, moped och flera månader i bil och undrar vad de ska ta härnäst. En del är vuxna och övningskör med partner. En del har två barn i olika skeden. Körpasset är till för er — utan att ersätta handledarens ansvar i bilen eller en trafikskola.</p>
    </div>
  </section>`;
}

function officialRules(): string {
  return `<section class="site-section site-section--white" id="regler">
    <div class="site-inner">
      <p class="eyebrow">Officiella regler</p>
      <h2>Ska du övningsköra privat?</h2>
      <p class="lede">Här är en kort sammanfattning för handledare, körkort och den som ska övningsköra privat. Körpasset är inte en myndighet — kontrollera alltid originalinformationen hos Transportstyrelsen.</p>
      <ul class="rule-list">
        <li>Eleven behöver ett giltigt körkortstillstånd.</li>
        <li>Privat övningskörning kräver en godkänd handledare.</li>
        <li>För B-behörighet får man börja övningsköra med personbil från 16 års ålder.</li>
        <li>Handledaren ansvarar som förare under privat övningskörning.</li>
        <li>ÖVNINGSKÖR-skylten ska vara väl synlig bakifrån.</li>
        <li>Kravet på introduktionsutbildning för privat övningskörning med personbil/lätt lastbil slopades 1 augusti 2026.</li>
      </ul>
      <aside class="info-box">
        <h3>Introduktionsutbildningen är inte längre ett krav</h3>
        <p>Sedan den 1 augusti 2026 behöver elev och handledare inte längre ha genomfört introduktionsutbildningen för privat övningskörning med personbil/lätt lastbil.</p>
        <p>Det krävs fortfarande bland annat körkortstillstånd för eleven och en godkänd handledare.</p>
        <p>${tsLink(TRANSPORTSTYRELSEN_LINKS.ovningskora, "Läs vad som gäller hos Transportstyrelsen")}</p>
      </aside>
      <h3>Läs mer hos Transportstyrelsen</h3>
      <ul class="official-links">
        <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.ovningskora, "Övningsköra")}</li>
        <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.handledare, "Handledare")}</li>
        <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.korkortstillstand, "Körkortstillstånd")}</li>
        <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.planera, "Planera övningskörningen")}</li>
        <li>${tsLink(TRANSPORTSTYRELSEN_LINKS.personbilB, "B – Personbil och lätt lastbil")}</li>
      </ul>
      <p class="muted">Regler kan ändras. Kontrollera alltid aktuell information hos Transportstyrelsen.</p>
    </div>
  </section>`;
}

function faq(): string {
  const items = LANDING_FAQ.map((item, index) => {
    const open = index === 0 ? " open" : "";
    const body = item.answerHtml ?? escapeHtml(item.answer);
    return `<details${open}>
          <summary>${escapeHtml(item.question)}</summary>
          <p>${body}</p>
        </details>`;
  }).join("");

  return `<section class="site-section site-section--cream" id="fragor">
    <div class="site-inner site-inner--narrow">
      <p class="eyebrow">Vanliga frågor</p>
      <h2>Vanliga frågor om övningskörning</h2>
      <div class="faq">
        ${items}
      </div>
    </div>
  </section>`;
}

function interestSection(
  formError: string,
  values: {
    name?: string;
    email?: string;
    role?: string;
    city?: string;
    message?: string;
    platformIos?: boolean;
    platformAndroid?: boolean;
  },
  action = "/interest",
): string {
  const roleOptions = (Object.entries(ROLE_LABELS) as [InterestRole, string][])
    .map(([value, label]) => {
      const selected = values.role === value ? " selected" : "";
      return `<option value="${value}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return `<section class="site-section site-section--cta" id="intresse" data-interest-form>
    <div class="site-inner site-inner--narrow">
      <p class="eyebrow">Beta</p>
      <h2>Ladda ner Körpasset</h2>
      <p class="lede">På iPhone laddar du ner direkt. På Android lämnar du mejl tills Google öppnat för öppet test.</p>
      <div class="download-paths">
        <div class="download-card" id="iphone">
          <h3>iPhone</h3>
          <p>Ladda ner via TestFlight. Öppna länken på iPhone, installera TestFlight om du inte redan har den, och gå med i testet.</p>
          <p class="download-note">Gratis under betan.</p>
          ${testFlightButton("Ladda ner för iPhone")}
        </div>
        <div class="download-card" id="android">
          <h3>Android</h3>
          <p>Google Play har inte öppnat för öppet test än. Vi väntar på granskning. Lämna din mejladress så hör vi av oss när det går att ladda ner.</p>
          <p>Ingen betalning under betan.</p>
          ${formError}
          <form method="post" action="${escapeHtml(action)}" class="interest-form" novalidate>
            <div class="hp" aria-hidden="true">
              <label for="website">Webbplats</label>
              <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
            </div>
            <input type="hidden" name="platform_android" value="yes">
            <div>
              <label for="name">Namn</label>
              <input id="name" name="name" type="text" required maxlength="80" autocomplete="name" value="${escapeHtml(values.name ?? "")}">
            </div>
            <div>
              <label for="email">Mejladress</label>
              <input id="email" name="email" type="email" required maxlength="120" autocomplete="email" value="${escapeHtml(values.email ?? "")}">
            </div>
            <div>
              <label for="role">Jag är</label>
              <select id="role" name="role" required>
                <option value="">Välj…</option>
                ${roleOptions}
              </select>
            </div>
            <div>
              <label for="city">Ort <span class="optional">(valfritt)</span></label>
              <input id="city" name="city" type="text" maxlength="80" autocomplete="address-level2" value="${escapeHtml(values.city ?? "")}">
            </div>
            <div>
              <label for="message">Kort om er övningskörning <span class="optional">(valfritt)</span></label>
              <p class="muted field-hint" id="message-hint">Hur länge ni kört, vilka som handleder och vad ni vill ha hjälp med — till exempel tips på nästa steg.</p>
              <textarea id="message" name="message" maxlength="1000" rows="4" aria-describedby="message-hint" placeholder="T.ex. dotter 16, just börjat. Jag kör oftast, pappa ibland. Eller: son 17, kört ett år, vill ha nästa steg.">${escapeHtml(values.message ?? "")}</textarea>
            </div>
            <label class="interest-choice">
              <input type="checkbox" name="consent" value="yes" required>
              <span>Jag vill bli kontaktad om betan. Vi använder uppgifterna bara för det. Läs mer i <a href="/integritet">integritetspolicyn</a>.</span>
            </label>
            ${primaryButton("Bli betatestare")}
          </form>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderInterestFormError(
  message: string,
  values: {
    name?: string;
    email?: string;
    role?: string;
    city?: string;
    message?: string;
    platformIos?: boolean;
    platformAndroid?: boolean;
  },
  options: PublicConsentOptions = {},
): string {
  return renderLandingPage({
    errorMessage: message,
    values,
    consent: options.consent,
    interestAction: options.interestAction,
  });
}
