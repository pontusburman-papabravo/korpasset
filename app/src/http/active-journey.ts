import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { JourneyRole } from "../services/authorization.js";
import { getJourneyAccess } from "../services/authorization.js";
import { recordProductEventSafe } from "../services/product-events.js";
import {
  listAccessibleActiveJourneys,
  type AccessibleJourney,
} from "../services/journeys.js";
import { layout, type AppLayoutOptions, type AppTab } from "./layout.js";

const JOURNEY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolvedActiveJourney {
  journey: AccessibleJourney;
  role: JourneyRole;
}

export function isJourneyId(value: string | undefined | null): value is string {
  return Boolean(value && JOURNEY_ID_RE.test(value));
}

export function readActiveJourneyId(request: FastifyRequest): string | null {
  const raw = request.cookies[config.activeJourneyCookieName];
  return isJourneyId(raw) ? raw : null;
}

export function setActiveJourneyCookie(reply: FastifyReply, journeyId: string): void {
  reply.setCookie(config.activeJourneyCookieName, journeyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function clearActiveJourneyCookie(reply: FastifyReply): void {
  reply.clearCookie(config.activeJourneyCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
  });
}

export async function resolveActiveJourney(
  userId: string,
  preferredId?: string | null,
): Promise<ResolvedActiveJourney | null> {
  const journeys = await listAccessibleActiveJourneys(userId);
  if (journeys.length === 0) return null;

  const preferred =
    preferredId && isJourneyId(preferredId)
      ? journeys.find((journey) => journey.id === preferredId)
      : undefined;

  let selected: AccessibleJourney | undefined;
  if (preferred) {
    selected = preferred;
  } else if (preferredId && isJourneyId(preferredId)) {
    selected = journeys[0];
  } else if (journeys.length === 1) {
    selected = journeys[0];
  } else {
    return null;
  }

  if (!selected) return null;
  const role: JourneyRole =
    selected.studentUserId === userId ? "student" : "supervisor";
  return { journey: selected, role };
}

export async function rememberActiveJourney(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  journeyId: string,
): Promise<JourneyRole | null> {
  const access = await getJourneyAccess(journeyId, userId);
  if (!access) return null;

  const previous = readActiveJourneyId(request);
  if (previous && previous !== journeyId) {
    const previousAccess = await getJourneyAccess(previous, userId);
    if (previousAccess) {
      await recordProductEventSafe({
        name: "journey_switched",
        journeyId,
        userId,
        actorRole: access.role,
      });
    }
  }

  setActiveJourneyCookie(reply, journeyId);
  return access.role;
}

export function tabForPath(path: string): AppTab | null {
  const p = path.split("?")[0];
  if (
    p === "/mer" ||
    p === "/konto" ||
    p.startsWith("/konto/") ||
    p === "/hjalp" ||
    p === "/radera-konto"
  ) {
    return "mer";
  }
  if (p === "/utveckling" || p.endsWith("/utveckling")) return "utveckling";
  if (
    p === "/nasta" ||
    p.endsWith("/nasta") ||
    p.endsWith("/drive/new") ||
    p.endsWith("/plan")
  ) {
    return "nasta";
  }
  if (p === "/resa" || /^\/journey\/[^/]+$/.test(p)) return "resa";
  return null;
}

export function layoutForRequest(
  request: FastifyRequest,
  title: string,
  body: string,
  options: AppLayoutOptions = {},
): string {
  return layout(title, body, {
    ...options,
    activeTab: options.activeTab ?? tabForPath(request.url),
  });
}

export async function redirectToActiveJourney(
  request: FastifyRequest,
  reply: FastifyReply,
  suffix: "" | "/nasta" | "/utveckling",
): Promise<void> {
  const { getSessionUserId } = await import("../auth/session.js");
  const { signedInRedirectPath } = await import("./navigation.js");
  const userId = getSessionUserId(request);
  if (!userId) {
    reply.redirect("/app");
    return;
  }
  const resolved = await resolveActiveJourney(userId, readActiveJourneyId(request));
  if (!resolved) {
    reply.redirect(await signedInRedirectPath(userId));
    return;
  }
  setActiveJourneyCookie(reply, resolved.journey.id);
  reply.redirect(`/journey/${resolved.journey.id}${suffix}`);
}
