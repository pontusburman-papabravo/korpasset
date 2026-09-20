import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { EmailSendError, getMailer } from "../services/email.js";
import { getSessionUserId } from "../auth/session.js";
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import {
  escapeHtml,
  errorBanner,
  layout,
  primaryButton,
  successBanner,
} from "./layout.js";
import { FEEDBACK_TOPICS } from "./journey-pages.js";
import { allowRequest } from "./rate-limit.js";
import { redactRequestPath } from "./log.js";

export const FEEDBACK_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
export const CLIENT_ERROR_RATE_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

function helpForm(errorMessage?: string, values: { topic?: string; message?: string } = {}): string {
  const options = FEEDBACK_TOPICS.map(
    (topic) =>
      `<option value="${topic.value}"${values.topic === topic.value ? " selected" : ""}>${escapeHtml(topic.label)}</option>`,
  ).join("");
  return `${errorMessage ? errorBanner(errorMessage) : ""}
    <h1>Hjälp</h1>
    <p>Berätta vad som strular. Vi läser under betan.</p>
    <form method="post" action="/hjalp" class="stack">
      <div>
        <label for="topic">Vad gäller det?</label>
        <select id="topic" name="topic" required class="supervisor-select">${options}</select>
      </div>
      <div>
        <label for="message">Meddelande</label>
        <textarea id="message" name="message" required rows="5" maxlength="2000">${escapeHtml(values.message ?? "")}</textarea>
      </div>
      ${primaryButton("Skicka")}
    </form>
    <p class="muted">Du kan också mejla <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>`;
}

export async function registerHelpRoutes(app: FastifyInstance): Promise<void> {
  app.get("/hjalp", async (_request, reply) => {
    return reply.type("text/html").send(layout("Hjälp", helpForm()));
  });

  app.post("/hjalp", async (request, reply) => {
    if (
      !allowRequest(
        `feedback:${request.ip || "unknown"}`,
        FEEDBACK_RATE_LIMIT.limit,
        FEEDBACK_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).type("text/html").send(
        layout("Hjälp", helpForm("För många försök. Vänta en stund och prova igen.")),
      );
    }

    const body = (request.body ?? {}) as { topic?: string; message?: string };
    const topic = FEEDBACK_TOPICS.find((item) => item.value === body.topic);
    const message = body.message?.trim() ?? "";
    if (!topic || message.length < 4) {
      return reply.status(400).type("text/html").send(
        layout(
          "Hjälp",
          helpForm("Välj ett ämne och skriv några rader.", {
            topic: body.topic,
            message: body.message,
          }),
        ),
      );
    }

    const userId = await getReusableSessionUserId(getSessionUserId(request));
    const user = userId ? await getUserById(userId) : null;
    const text = [
      `Ämne: ${topic.label}`,
      `Användare: ${userId ?? "ej inloggad"}`,
      `Namn: ${user?.displayName ?? "-"}`,
      "",
      message.slice(0, 2000),
    ].join("\n");

    try {
      if (config.resendApiKey) {
        await getMailer().send({
          to: "support@korpasset.se",
          subject: `Beta-feedback: ${topic.label}`,
          text,
        });
      } else {
        request.log.info({ topic: topic.value }, "feedback received without mailer");
      }
    } catch (error) {
      if (!(error instanceof EmailSendError)) {
        request.log.error({ err: error }, "feedback send failed");
      } else {
        request.log.error({ err: error }, "feedback mailer failed");
      }
    }

    return reply.type("text/html").send(
      layout(
        "Tack",
        `${successBanner("Tack — vi har tagit emot det.")}
         <p><a class="btn btn-secondary" href="/">Tillbaka</a></p>`,
      ),
    );
  });

  app.post("/api/client-error", async (request, reply) => {
    if (
      !allowRequest(
        `client-error:${request.ip || "unknown"}`,
        CLIENT_ERROR_RATE_LIMIT.limit,
        CLIENT_ERROR_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(204).send();
    }
    const body = (request.body ?? {}) as { message?: unknown; path?: unknown };
    const message =
      typeof body.message === "string" ? body.message.slice(0, 500) : "client error";
    const path =
      typeof body.path === "string" ? redactRequestPath(body.path) : "";
    request.log.warn({ clientError: true, message, path }, "client error");
    return reply.status(204).send();
  });
}
