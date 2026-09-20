import { listAccessibleActiveJourneys } from "../services/journeys.js";

export async function signedInRedirectPath(userId: string): Promise<string> {
  const journeys = await listAccessibleActiveJourneys(userId);
  if (journeys.length === 1) return `/journey/${journeys[0].id}`;
  if (journeys.length === 0) return "/onboarding";
  return "/";
}

export function parseInviteReturnTo(returnTo: string | undefined): string | null {
  if (!returnTo) return null;
  const match = returnTo.trim().match(/^\/invite\/([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}
