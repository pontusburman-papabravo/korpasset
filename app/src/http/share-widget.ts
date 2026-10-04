import { SHARE_TEXT, SHARE_TITLE, type ShareSurface } from "../services/share.js";
import { escapeHtml, siteLayout } from "./layout.js";
import { publicPageJsonLd } from "./seo.js";

const TIPS_DESCRIPTION =
  "Tipsa någon som övningskör privat. Körpasset hjälper körkortselev och handledare att hålla koll på körpassen.";

export function shareAttributes(input: {
  surface: ShareSurface;
  url: string;
  silentView?: boolean;
}): string {
  const silent = input.silentView ? ` data-share-silent-view="1"` : "";
  return `data-share data-share-surface="${input.surface}" data-share-url="${escapeHtml(input.url)}" data-share-title="${escapeHtml(SHARE_TITLE)}" data-share-text="${escapeHtml(SHARE_TEXT)}"${silent}`;
}

function feedback(): string {
  return `<p class="muted share-prompt__feedback" data-share-feedback hidden></p>`;
}

/** Permanent card on the account page. */
export function appShareCard(url: string): string {
  return `<section class="card share-prompt" ${shareAttributes({ surface: "app", url })}>
    <h2>Gillar du Körpasset?</h2>
    <p>Tipsa någon som också övningskör.</p>
    <div class="share-prompt__actions">
      <button type="button" class="btn btn-secondary" data-share-action="share">Tipsa en vän</button>
      <button type="button" class="btn-link" data-share-action="copy">Kopiera länk</button>
    </div>
    ${feedback()}
  </section>`;
}

/** Secondary line after a finished drive. Does not replace the primary exit. */
export function driveDoneSharePrompt(url: string): string {
  return `<section class="share-prompt share-prompt--quiet" ${shareAttributes({ surface: "app", url })}>
    <p>Gillar du Körpasset? Tipsa någon som också övningskör.</p>
    <div class="share-prompt__actions">
      <button type="button" class="btn-link" data-share-action="share">Tipsa en vän</button>
    </div>
    ${feedback()}
  </section>`;
}

export function websiteShareSection(url: string): string {
  return `<section class="site-section site-section--cream" id="tipsa">
    <div class="site-inner site-inner--narrow" ${shareAttributes({ surface: "website", url })}>
      <p class="eyebrow">Tipsa</p>
      <h2>Övningskör ni redan med Körpasset?</h2>
      <p class="lede">Tipsa gärna någon annan som snart ska börja.</p>
      <div class="share-prompt__actions">
        <button type="button" class="btn btn-primary" data-share-action="share">Tipsa en vän</button>
        <button type="button" class="btn btn-secondary" data-share-action="copy">Kopiera länk</button>
      </div>
      ${feedback()}
    </div>
  </section>`;
}

export function renderTipsPage(input: {
  header: string;
  footer: string;
  consent: boolean;
  platform: "ios" | "android" | "web";
  surface: ShareSurface;
  shareLink: string;
  appStoreUrl: string;
  playStoreUrl: string;
}): string {
  return siteLayout(
    "Tipsa en vän",
    `${input.header}
     <main>
       <section class="site-section site-section--cream" data-platform="${input.platform}">
         <div class="site-inner site-inner--narrow">
           <p class="eyebrow">Körpasset</p>
           <h1>Tipsa en vän</h1>
           <p class="lede">Känner du någon som också övningskör? Tipsa gärna om Körpasset.</p>
           <div class="share-prompt" ${shareAttributes({ surface: input.surface, url: input.shareLink, silentView: true })}>
             <div class="share-prompt__actions">
               <button type="button" class="btn btn-primary" data-share-action="share">Dela</button>
               <button type="button" class="btn btn-secondary" data-share-action="copy">Kopiera länk</button>
             </div>
             ${feedback()}
           </div>
           <div class="tips-paths" data-platform="${input.platform}">
             <article class="download-card tips-path tips-path--ios">
               <h2>iPhone</h2>
               <p>Ladda ner Körpasset i App Store.</p>
               <a class="btn btn-primary" id="tips-app-store" href="${escapeHtml(input.appStoreUrl)}" rel="noopener noreferrer">App Store</a>
             </article>
             <article class="download-card tips-path tips-path--android">
               <h2>Android</h2>
               <p>Google Play är inte öppet för alla än. Lämna din mejladress så hör vi av oss.</p>
               <a class="btn btn-primary" id="tips-play-store" href="${escapeHtml(input.playStoreUrl)}" rel="noopener noreferrer">Google Play</a>
               <p><a href="/#android">Lämna mejl för Android</a></p>
             </article>
             <article class="download-card tips-path tips-path--web">
               <h2>Redan igång</h2>
               <p>Öppna Körpasset på den här enheten.</p>
               <a class="btn btn-secondary" id="tips-open-app" href="/app">Öppna Körpasset</a>
             </article>
           </div>
         </div>
       </section>
     </main>
     ${input.footer}
     <script src="/share.js" defer></script>`,
    {
      description: TIPS_DESCRIPTION,
      path: "/tips",
      documentTitle: "Tipsa en vän · Körpasset",
      consent: input.consent,
      jsonLd: publicPageJsonLd({
        path: "/tips",
        title: "Tipsa en vän · Körpasset",
        description: TIPS_DESCRIPTION,
        includeApp: true,
        appDownloadUrl: input.appStoreUrl,
      }),
    },
  );
}
