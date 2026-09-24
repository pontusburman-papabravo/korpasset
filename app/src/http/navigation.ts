import {
  listAccessibleActiveJourneys,
  type AccessibleJourney,
} from "../services/journeys.js";
import { escapeHtml, layout, successBanner } from "./layout.js";
import {
  journeyIdentityForRole,
  pickerRoleLine,
  renderJourneyIdentity,
  supervisorJourneyTitle,
} from "./journey-identity.js";

export type SignedInHome =
  | { kind: "onboarding" }
  | { kind: "journey"; journeyId: string }
  | { kind: "picker"; journeys: AccessibleJourney[] };

export async function signedInHome(userId: string): Promise<SignedInHome> {
  const journeys = await listAccessibleActiveJourneys(userId);
  if (journeys.length === 1) {
    return { kind: "journey", journeyId: journeys[0].id };
  }
  if (journeys.length === 0) return { kind: "onboarding" };
  return { kind: "picker", journeys };
}

export async function signedInRedirectPath(userId: string): Promise<string> {
  const home = await signedInHome(userId);
  if (home.kind === "journey") return `/journey/${home.journeyId}`;
  if (home.kind === "onboarding") return "/onboarding";
  return "/app";
}

export function renderJourneyPickerPage(
  journeys: AccessibleJourney[],
  viewerUserId: string,
): string {
  const hasOwnJourney = journeys.some((journey) => journey.studentUserId === viewerUserId);
  const heading = hasOwnJourney ? "Vilken körkortsresa vill du öppna?" : "Välj elev";
  const choices = journeys
    .map((journey) => {
      const owned = journey.studentUserId === viewerUserId;
      const title = owned
        ? "Min körkortsresa"
        : supervisorJourneyTitle(journey.studentName);
      return `<a class="card journey-choice" href="/journey/${escapeHtml(journey.id)}">
        <span class="journey-choice__title">${escapeHtml(title)}</span>
        <span class="journey-choice__meta">${escapeHtml(pickerRoleLine(owned, journey.lastDriveAt))}</span>
      </a>`;
    })
    .join("");
  return layout(
    heading,
    `<h1>${escapeHtml(heading)}</h1>
     <p class="muted">${
       hasOwnJourney
         ? "Varje körkortsresa är separat — access, utveckling och betalning blandas inte."
         : "Du kan följa flera elever. Varje resa är separat."
     }</p>
     <div class="stack">${choices}</div>`,
    { activeTab: "resa" },
  );
}

export function renderMorePage(options: {
  identity: ReturnType<typeof journeyIdentityForRole> | null;
  journeyCount: number;
  sentNotice?: boolean;
}): string {
  const identity = options.identity
    ? renderJourneyIdentity(options.identity)
    : `<h1>Mer</h1>`;
  const thanks = options.sentNotice
    ? successBanner("Tack — vi har tagit emot det.")
    : "";
  const switcher =
    options.journeyCount > 1
      ? `<p><a class="btn btn-secondary" href="/app">Byt körkortsresa</a></p>`
      : "";
  return `${thanks}
    ${identity}
    ${switcher}
    <nav class="more-menu" aria-label="Mer">
      <a href="/konto">Konto</a>
      <a href="/hjalp">Hjälp</a>
      <a href="/integritet">Integritet</a>
      <a href="/villkor">Villkor</a>
      <a href="/radera-konto">Radera konto</a>
    </nav>
    <form method="post" action="/logout">
      <button type="submit" class="btn btn-secondary">Logga ut</button>
    </form>`;
}
