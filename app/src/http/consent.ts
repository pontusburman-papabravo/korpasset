import { config } from "../config.js";

/** Bump when purposes or vendors change so earlier choices are asked again. */
export const CONSENT_VERSION = 1;

export const CONSENT_COOKIE_NAME = "korpasset_consent";

/** Six months. Visitors can change or withdraw the choice at any time before that. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function consentConfigJson(): string {
  return JSON.stringify({
    version: CONSENT_VERSION,
    cookieName: CONSENT_COOKIE_NAME,
    maxAgeSeconds: CONSENT_MAX_AGE_SECONDS,
    gaMeasurementId: config.gaMeasurementId,
  });
}

export function consentHead(): string {
  return `<link rel="stylesheet" href="/consent.css">
  <script>window.KORPASSET_CONSENT_CONFIG = ${consentConfigJson()};</script>`;
}

export function consentBody(): string {
  return `<div class="consent" data-consent-root hidden>
  <section class="consent__banner" role="dialog" aria-labelledby="consent-title" aria-describedby="consent-text">
    <h2 id="consent-title">Cookies på Körpasset</h2>
    <p id="consent-text">Nödvändiga cookies får webbplatsen, inloggningen och ditt cookieval att fungera. Analys (Google Analytics) och andra tredjepartsverktyg används bara om du själv godkänner dem.</p>
    <p class="consent__links"><a href="/cookies">Cookiepolicy</a> · <a href="/integritet">Integritetspolicy</a></p>
    <div class="consent__actions">
      <button type="button" class="consent__btn consent__btn--primary" data-consent-accept>Godkänn alla</button>
      <button type="button" class="consent__btn consent__btn--primary" data-consent-reject>Bara nödvändiga</button>
      <button type="button" class="consent__btn consent__btn--quiet" data-consent-customize>Anpassa</button>
    </div>
  </section>
  <section class="consent__panel" role="dialog" aria-labelledby="consent-panel-title" hidden>
    <h2 id="consent-panel-title">Anpassa cookies</h2>
    <p>Valfria kategorier är avstängda tills du kryssar i dem. Du kan ändra eller återkalla valet när som helst.</p>
    <label class="consent__choice">
      <input type="checkbox" checked disabled>
      <span>
        <strong>Nödvändiga</strong>
        <span class="consent__choice-text">Alltid aktiva. Session, säkerhet och att spara det här valet. Inget samtycke krävs.</span>
      </span>
    </label>
    <label class="consent__choice">
      <input type="checkbox" id="consent-analytics" data-consent-analytics>
      <span>
        <strong>Analys</strong>
        <span class="consent__choice-text">Google Analytics 4, om det är aktiverat för webbplatsen. Visar hur sidor används. Google kan behandla uppgifter utanför EU/EES. Skriptet laddas bara efter samtycke.</span>
      </span>
    </label>
    <label class="consent__choice">
      <input type="checkbox" id="consent-marketing" data-consent-marketing>
      <span>
        <strong>Marknadsföring och andra tredjepart</strong>
        <span class="consent__choice-text">Verktyg för marknadsföring eller annat inbäddat innehåll. Inget sådant verktyg körs utan samtycke.</span>
      </span>
    </label>
    <div class="consent__actions">
      <button type="button" class="consent__btn consent__btn--primary" data-consent-save>Spara val</button>
      <button type="button" class="consent__btn consent__btn--primary" data-consent-accept>Godkänn alla</button>
      <button type="button" class="consent__btn consent__btn--primary" data-consent-reject>Bara nödvändiga</button>
    </div>
  </section>
</div>
<button type="button" class="consent__reopen" data-consent-open hidden>Cookies</button>
<script src="/consent.js" defer></script>`;
}
