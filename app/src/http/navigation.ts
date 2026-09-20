import { listAccessibleActiveJourneys } from "../services/journeys.js";

export async function signedInRedirectPath(userId: string): Promise<string> {
  const journeys = await listAccessibleActiveJourneys(userId);
  if (journeys.length === 1) return `/journey/${journeys[0].id}`;
  if (journeys.length === 0) return "/onboarding";
  return "/";
}
