import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { META_LEAD_COOKIE_NAME } from "./consent.js";
import { EmailSendError, notifyWaitlistSignup } from "../services/email.js";
import { countBetaWaitlist, saveInterestSignup } from "../services/interest.js";
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
import { robotsTxt, sitemapXml } from "./seo.js";
import { INTEREST_RATE_LIMIT, allowRequest } from "./rate-limit.js";

function markSavedLead(reply: FastifyReply): void {
  reply.setCookie(META_LEAD_COOKIE_NAME, "1", {
    path: "/interest/tack",
    httpOnly: false,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: 120,
  });
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

export async function registerMarketingRoutes(app: FastifyInstance): Promise<void> {
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

  app.get("/integritet", async (_request, reply) => {
    return reply.type("text/html").send(privacyPage());
  });

  app.get("/cookies", async (_request, reply) => {
    return reply.type("text/html").send(cookiesPage());
  });

  app.get("/villkor", async (_request, reply) => {
    return reply.type("text/html").send(termsPage());
  });

  app.get("/kontakt", async (_request, reply) => {
    return reply.type("text/html").send(contactPage());
  });

  app.get("/radera-konto", async (_request, reply) => {
    return reply.type("text/html").send(accountDeletionPage());
  });

  app.get("/interest/tack", async (_request, reply) => {
    return reply.type("text/html").send(renderInterestThanksPage());
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
          await countBetaWaitlist(),
        ),
      );
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const values = formValues(body);

    if (body.consent !== "yes") {
      return reply.status(400).type("text/html").send(
        renderInterestFormError(
          "Bekräfta att du vill bli kontaktad om betan.",
          values,
          await countBetaWaitlist(),
        ),
      );
    }

    try {
      const result = await saveInterestSignup({
        ...values,
        honeypot: typeof body.website === "string" ? body.website : "",
      });
      if (!result) {
        return reply.redirect("/interest/tack");
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
      return reply.redirect("/interest/tack");
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "Kunde inte spara anmälan.";
      return reply.status(400).type("text/html").send(
        renderInterestFormError(message, values, await countBetaWaitlist()),
      );
    }
  });
}
