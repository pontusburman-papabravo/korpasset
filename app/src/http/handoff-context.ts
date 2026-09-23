import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { JourneyCreatedSource } from "../services/product-events.js";

export const STUDENT_HANDOFF_VIA = "handledare";
export const HANDOFF_COOKIE_NAME = "korpasset_handoff";
const HANDOFF_COOKIE_VALUE = "parent";
/** Attribution window after the student opens the handoff URL. Consumed on POST /start. */
export const HANDOFF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function isParentHandoffQuery(query: { som?: string; via?: string }): boolean {
  return query.som === "elev" && query.via === STUDENT_HANDOFF_VIA;
}

export function readJourneyCreatedSource(request: FastifyRequest): JourneyCreatedSource {
  return request.cookies[HANDOFF_COOKIE_NAME] === HANDOFF_COOKIE_VALUE
    ? "parent_handoff"
    : "direct";
}

export function setHandoffCookie(reply: FastifyReply): void {
  reply.setCookie(HANDOFF_COOKIE_NAME, HANDOFF_COOKIE_VALUE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: HANDOFF_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearHandoffCookie(reply: FastifyReply): void {
  reply.clearCookie(HANDOFF_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
  });
}
