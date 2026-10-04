import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getSessionUserId } from "../auth/session.js";
import { wantsPublicCookieConsent } from "../auth/session.js";
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
  REFERRAL_SEEN_COOKIE,
  findReferrerByCode,
  isReferralCode,
  isShareClientEvent,
  isSharePlatform,
  isShareSurface,
  parseReferralCookie,
  personalShareUrl,
  platformFromUserAgent,
  recordShareEvent,
  referralCookieValue,
  resolveShareActor,
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

export function readReferralCookie(request: FastifyRequest): string | undefined {
  const value = request.cookies[REFERRAL_COOKIE];
  return typeof value === "string" ? value : undefined;
}

function cookieBase() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.cookieSecure,
    signed: false,
  };
}

function landingSurface(query: { source?: unknown; ref?: unknown }): ShareSurface {
  if (isShareSurface(query.source)) return query.source;
  return surfaceFromShareRef(query.ref) ?? "website";
}

export async function registerShareRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tips", async (request, reply) => {
    const query = request.query as { r?: unknown; source?: unknown; ref?: unknown };
    const rawCode = typeof query.r === "string" ? query.r.trim() : "";
    const surface = landingSurface(query);
    const platform = platformFromUserAgent(request.headers["user-agent"]);
    const visitorId = await getReusableSessionUserId(getSessionUserId(request));
    const referrer = isReferralCode(rawCode) ? await findReferrerByCode(rawCode) : null;
    const selfVisit = Boolean(referrer && visitorId && referrer.userId === visitorId);

    if (referrer && !selfVisit) {
      const seen = request.cookies[REFERRAL_SEEN_COOKIE];
      if (seen !== rawCode) {
        await recordShareEvent({
          name: "share_landing_viewed",
          surface,
          platform,
          userId: null,
          referrerUserId: referrer.userId,
        });
        reply.setCookie(REFERRAL_SEEN_COOKIE, rawCode, cookieBase());
      }
      await rememberFirstReferral(request, reply, rawCode, surface);
    }

    const shareLink = visitorId
      ? await personalShareUrl(visitorId, "website")
      : shareUrl("website");
    const consent = wantsPublicCookieConsent(request);
    return reply.type("text/html").send(
      renderTipsPage({
        header: siteHeader(),
        footer: siteFooter({ cookieSettings: consent }),
        consent,
        platform,
        surface: "website",
        shareLink,
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
    const actor = userId
      ? await resolveShareActor(userId, readActiveJourneyId(request))
      : null;
    await recordShareEvent({
      name: body.event,
      surface: body.surface,
      platform,
      userId,
      journeyId: actor?.journeyId ?? null,
      actorRole: actor?.actorRole ?? null,
      referrerUserId: userId,
    });
    return reply.status(204).send();
  });
}

async function rememberFirstReferral(
  request: FastifyRequest,
  reply: FastifyReply,
  code: string,
  surface: ShareSurface,
): Promise<void> {
  const existing = parseReferralCookie(request.cookies[REFERRAL_COOKIE]);
  if (existing && (await findReferrerByCode(existing.code))) return;
  reply.setCookie(REFERRAL_COOKIE, referralCookieValue(code, surface), {
    ...cookieBase(),
    maxAge: REFERRAL_MAX_AGE_SECONDS,
  });
}
