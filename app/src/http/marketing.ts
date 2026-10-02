import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { wantsPublicCookieConsent } from "../auth/session.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import {
  GA_LEAD_COOKIE_NAME,
  LEAD_SIGNAL_MAX_AGE_SECONDS,
  META_LEAD_COOKIE_NAME,
} from "./consent.js";
import { EmailSendError, notifyWaitlistSignup } from "../services/email.js";
import { saveInterestSignup } from "../services/interest.js";
import {
  renderInterestFormError,
  renderInterestThanksPage,
} from "./landing.js";
import {
  accountDeletionPage,
  contactPage,
  cookiesPage,
  privacyPage,
  termsPage,
} from "./legal.js";
import { registerGuideRoutes } from "./guides.js";
import { robotsTxt, sitemapXml } from "./seo.js";
import { INTEREST_RATE_LIMIT, allowRequest } from "./rate-limit.js";

const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
] as const;

const CAMPAIGN_VALUE = /^[\p{L}\p{N}._~+:@-]{1,80}$/u;

/** Allowlisted campaign params only. Dropped values never reach the redirect or the form. */
export function campaignSearch(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  const source = query as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const raw = source[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!CAMPAIGN_VALUE.test(value)) continue;
    params.append(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function thanksLocation(query: unknown): string {
  return `/interest/tack${campaignSearch(query)}`;
}

function markSavedLead(reply: FastifyReply): void {
  const token = `1.${randomBytes(9).toString("base64url")}`;
  for (const name of [META_LEAD_COOKIE_NAME, GA_LEAD_COOKIE_NAME]) {
    reply.setCookie(name, token, {
      path: "/interest/tack",
      httpOnly: false,
      sameSite: "lax",
      secure: config.cookieSecure,
      signed: false,
      maxAge: LEAD_SIGNAL_MAX_AGE_SECONDS,
    });
  }
}

function checkboxChecked(value: unknown): boolean {
  return value === "yes" || value === "on" || value === true;
}

function formValues(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : "",
    role: typeof body.role === "string" ? body.role : "",
    city: typeof body.city === "string" ? body.city : "",
    message: typeof body.message === "string" ? body.message : "",
    platformIos: checkboxChecked(body.platform_ios),
    platformAndroid: checkboxChecked(body.platform_android),
  };
}

function publicConsent(request: FastifyRequest) {
  return { consent: wantsPublicCookieConsent(request) };
}

function interestPageOptions(request: FastifyRequest) {
  return {
    consent: wantsPublicCookieConsent(request),
    interestAction: `/interest${campaignSearch(request.query)}`,
  };
}

export async function registerMarketingRoutes(app: FastifyInstance): Promise<void> {
  await registerGuideRoutes(app);

  app.get("/robots.txt", async (_request, reply) => {
    return reply
      .type("text/plain; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(robotsTxt());
  });

  app.get("/sitemap.xml", async (_request, reply) => {
    return reply
      .type("application/xml; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(sitemapXml());
  });

  app.get("/integritet", async (request, reply) => {
    return reply.type("text/html").send(privacyPage(publicConsent(request)));
  });

  app.get("/cookies", async (request, reply) => {
    return reply.type("text/html").send(cookiesPage(publicConsent(request)));
  });

  app.get("/villkor", async (request, reply) => {
    return reply.type("text/html").send(termsPage(publicConsent(request)));
  });

  app.get("/kontakt", async (request, reply) => {
    return reply.type("text/html").send(contactPage(publicConsent(request)));
  });

  app.get("/radera-konto", async (request, reply) => {
    return reply.type("text/html").send(accountDeletionPage(publicConsent(request)));
  });

  app.get("/interest/tack", async (request, reply) => {
    return reply.type("text/html").send(renderInterestThanksPage(publicConsent(request)));
  });

  app.post("/interest", async (request, reply) => {
    if (
      !allowRequest(
        `interest:${request.ip || "unknown"}`,
        INTEREST_RATE_LIMIT.limit,
        INTEREST_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).type("text/html").send(
        renderInterestFormError(
          "För många försök. Vänta en stund och prova igen.",
          formValues((request.body ?? {}) as Record<string, unknown>),
          interestPageOptions(request),
        ),
      );
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const values = formValues(body);

    if (body.consent !== "yes") {
      return reply.status(400).type("text/html").send(
        renderInterestFormError(
          "Bekräfta att du vill bli kontaktad om Körpasset.",
          values,
          interestPageOptions(request),
        ),
      );
    }

    try {
      const result = await saveInterestSignup({
        ...values,
        honeypot: typeof body.website === "string" ? body.website : "",
      });
      if (!result) {
        return reply.redirect(thanksLocation(request.query));
      }
      if (result.created) markSavedLead(reply);
      try {
        await notifyWaitlistSignup(result.signup, result.created);
      } catch (error) {
        if (error instanceof EmailSendError) {
          request.log.error({ err: error }, "waitlist mailer failed");
        } else {
          request.log.error({ err: error }, "waitlist notify failed");
        }
      }
      return reply.redirect(thanksLocation(request.query));
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "Kunde inte spara anmälan.";
      return reply.status(400).type("text/html").send(
        renderInterestFormError(
          message,
          values,
          interestPageOptions(request),
        ),
      );
    }
  });
}
