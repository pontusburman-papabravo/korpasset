import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getSessionUserId } from "../auth/session.js";
import { wantsPublicCookieConsent } from "../auth/session.js";
import { getJourneyAccess } from "../services/authorization.js";
import {
  SHARE_REF_COOKIE,
  SHARE_REF_MAX_AGE_SECONDS,
  isShareClientEvent,
  isSharePlatform,
  isShareSurface,
  platformFromUserAgent,
  recordShareEvent,
  shareRef,
  shareUrl,
  surfaceFromShareRef,
  type ShareSurface,
} from "../services/share.js";
import { getReusableSessionUserId } from "../services/users.js";
import { readActiveJourneyId } from "./active-journey.js";
import { APP_STORE_URL, PLAY_STORE_URL, siteFooter, siteHeader } from "./landing.js";
import { allowRequest } from "./rate-limit.js";
import { renderTipsPage } from "./share-widget.js";

const SHARE_RATE_LIMIT = { limit: 40, windowMs: 10 * 60 * 1000 };

export function readShareSurface(request: FastifyRequest): ShareSurface | null {
  return surfaceFromShareRef(request.cookies[SHARE_REF_COOKIE]);
}

export function setShareRefCookie(reply: FastifyReply, surface: ShareSurface): void {
  reply.setCookie(SHARE_REF_COOKIE, shareRef(surface), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: SHARE_REF_MAX_AGE_SECONDS,
  });
}

export async function registerShareRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tips", async (request, reply) => {
    const ref = surfaceFromShareRef((request.query as { ref?: unknown }).ref);
    if (ref) setShareRefCookie(reply, ref);
    const surface = ref ?? readShareSurface(request);
    const platform = platformFromUserAgent(request.headers["user-agent"]);
    const userId = await getReusableSessionUserId(getSessionUserId(request));
    const journey = await shareJourney(request, userId);
    await recordShareEvent({
      name: "share_landing_viewed",
      surface,
      platform,
      userId,
      journeyId: journey?.journeyId ?? null,
      actorRole: journey?.actorRole ?? null,
    });
    const consent = wantsPublicCookieConsent(request);
    return reply.type("text/html").send(
      renderTipsPage({
        header: siteHeader(),
        footer: siteFooter({ cookieSettings: consent }),
        consent,
        platform,
        surface: surface ?? "website",
        shareLink: shareUrl(surface ?? "website"),
        appStoreUrl: APP_STORE_URL,
        playStoreUrl: PLAY_STORE_URL,
      }),
    );
  });

  app.post("/api/share", async (request, reply) => {
    if (
      !allowRequest(
        `share:${request.ip || "unknown"}`,
        SHARE_RATE_LIMIT.limit,
        SHARE_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).send({ error: "Too many requests" });
    }
    const body = (request.body ?? {}) as {
      event?: unknown;
      surface?: unknown;
      platform?: unknown;
    };
    if (!isShareClientEvent(body.event) || !isShareSurface(body.surface)) {
      return reply.status(400).send({ error: "Invalid share event" });
    }
    const platform = isSharePlatform(body.platform)
      ? body.platform
      : platformFromUserAgent(request.headers["user-agent"]);
    const userId = await getReusableSessionUserId(getSessionUserId(request));
    const journey = await shareJourney(request, userId);
    await recordShareEvent({
      name: body.event,
      surface: body.surface,
      platform,
      userId,
      journeyId: journey?.journeyId ?? null,
      actorRole: journey?.actorRole ?? null,
    });
    return reply.status(204).send();
  });
}

async function shareJourney(
  request: FastifyRequest,
  userId: string | null,
): Promise<{ journeyId: string; actorRole: "student" | "supervisor" } | null> {
  if (!userId) return null;
  const journeyId = readActiveJourneyId(request);
  if (!journeyId) return null;
  const access = await getJourneyAccess(journeyId, userId);
  if (!access) return null;
  return { journeyId, actorRole: access.role };
}
