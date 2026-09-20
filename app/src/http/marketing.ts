import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import { EmailSendError, notifyWaitlistSignup } from "../services/email.js";
import { countBetaWaitlist, saveInterestSignup } from "../services/interest.js";
import {
  renderInterestFormError,
  renderInterestThanksPage,
} from "./landing.js";
import { contactPage, privacyPage, termsPage } from "./legal.js";
import { INTEREST_RATE_LIMIT, allowRequest } from "./rate-limit.js";

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
  app.get("/integritet", async (_request, reply) => {
    return reply.type("text/html").send(privacyPage());
  });

  app.get("/villkor", async (_request, reply) => {
    return reply.type("text/html").send(termsPage());
  });

  app.get("/kontakt", async (_request, reply) => {
    return reply.type("text/html").send(contactPage());
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
