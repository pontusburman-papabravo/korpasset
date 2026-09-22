import {
  formatAccessibleJourneyLabel,
  listAccessibleActiveJourneys,
  type AccessibleJourney,
} from "../services/journeys.js";
import { escapeHtml, layout } from "./layout.js";

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
      const label = formatAccessibleJourneyLabel(journey, viewerUserId);
      return `<a class="card journey-choice" href="/journey/${escapeHtml(journey.id)}">${escapeHtml(label)}</a>`;
    })
    .join("");
  return layout(
    heading,
    `<h1>${escapeHtml(heading)}</h1>
     <p>Du kan följa flera elever — till exempel två barn, eller partner och barn.</p>
     <div class="stack">${choices}</div>`,
  );
}
