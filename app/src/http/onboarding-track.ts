import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export type OnboardingTrack = "elev" | "handledare";

export const ONBOARDING_TRACK_COOKIE = "korpasset_onboarding_track";
export const ONBOARDING_TRACK_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const STUDENT_ONBOARDING_PATH = "/onboarding/elev";
export const SUPERVISOR_ONBOARDING_PATH = "/onboarding/handledare";
export const ONBOARDING_CHOOSER_PATH = "/onboarding";
export const ONBOARDING_CHOOSER_RESET_PATH = "/onboarding?byt=1";

export function parseOnboardingTrack(
  value: string | undefined | null,
): OnboardingTrack | null {
  if (value === "elev" || value === "handledare") return value;
  return null;
}

export function readOnboardingTrack(request: FastifyRequest): OnboardingTrack | null {
  return parseOnboardingTrack(request.cookies[ONBOARDING_TRACK_COOKIE]);
}

export function onboardingPathForTrack(track: OnboardingTrack | null | undefined): string {
  if (track === "handledare") return SUPERVISOR_ONBOARDING_PATH;
  if (track === "elev") return STUDENT_ONBOARDING_PATH;
  return ONBOARDING_CHOOSER_PATH;
}

export function setOnboardingTrackCookie(reply: FastifyReply, track: OnboardingTrack): void {
  reply.setCookie(ONBOARDING_TRACK_COOKIE, track, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: ONBOARDING_TRACK_MAX_AGE_SECONDS,
  });
}

export function clearOnboardingTrackCookie(reply: FastifyReply): void {
  reply.clearCookie(ONBOARDING_TRACK_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
  });
}

export function onboardingTrackFromRequest(
  request: FastifyRequest,
): "elev" | "handledare" | "val" {
  const urlPath = (request.url || "").split("?")[0];
  const query = request.query as { som?: string; byt?: string };
  if (query.byt === "1") return "val";
  if (urlPath === STUDENT_ONBOARDING_PATH || query.som === "elev") return "elev";
  if (urlPath === SUPERVISOR_ONBOARDING_PATH || query.som === "handledare") {
    return "handledare";
  }
  return "val";
}
