import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { EmailSendError, getMailer } from "../services/email.js";
import { getSessionUserId } from "../auth/session.js";
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import { getFeedbackReplyContact } from "../services/oauth-accounts.js";
import {
  escapeHtml,
  errorBanner,
  layout,
  primaryButton,
  successBanner,
} from "./layout.js";
import { layoutForRequest } from "./active-journey.js";
import { FEEDBACK_TOPICS } from "./journey-pages.js";
import { allowRequest } from "./rate-limit.js";
import { redactRequestPath } from "./log.js";
import { parseUserClientReport, recordUserClient } from "../services/user-client.js";

export const FEEDBACK_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
export const CLIENT_ERROR_RATE_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };
export const FEEDBACK_SENT_QUERY = "skickat=1";

export function isFeedbackSentQuery(query: unknown): boolean {
  const value = (query as { skickat?: string | string[] } | undefined)?.skickat;
  return (Array.isArray(value) ? value[0] : value) === "1";
}

export function helpThanks(backHref: string): string {
  return `${successBanner("Tack — vi har tagit emot det.")}
    <p><a class="btn btn-secondary" href="${escapeHtml(backHref)}">Tillbaka</a></p>`;
}

const HELP_LAYOUT = { supportBubble: false } as const;

/** Local app path to attach to a support mail. Drops off-site values and invite tokens. */
export function readSupportPage(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    trimmed.length > 200 ||
    /[\r\n]/.test(trimmed)
  ) {
    return "";
  }
  return redactRequestPath(trimmed).slice(0, 200);
}

function helpForm(
  errorMessage?: string,
  values: { topic?: string; message?: string; from?: string } = {},
): string {
  const topicValue = FEEDBACK_TOPICS.some((item) => item.value === values.topic)
    ? values.topic
    : undefined;
  const from = readSupportPage(values.from);
  const bugReport = topicValue === "technical";
  const options = FEEDBACK_TOPICS.map(
    (topic) =>
      `<option value="${topic.value}"${topicValue === topic.value ? " selected" : ""}>${escapeHtml(topic.label)}</option>`,
  ).join("");
  const intro = bugReport
    ? `<p>Beskriv vad som gick fel. Vi läser under betan.</p>`
    : `<p>I resan finns handledarguiden: tips, frågor och steg för varje moment.</p>
    <p>Berätta vad som strular. Vi läser under betan.</p>`;
  return `${errorMessage ? errorBanner(errorMessage) : ""}
    <h1>${bugReport ? "Rapportera en bugg" : "Hjälp"}</h1>
    ${intro}
    <form method="post" action="/hjalp" class="stack">
      ${from ? `<input type="hidden" name="from" value="${escapeHtml(from)}">` : ""}
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
  app.get("/hjalp", async (request, reply) => {
    const query = (request.query ?? {}) as { topic?: string; from?: string };
    if (isFeedbackSentQuery(query)) {
      return reply.type("text/html").send(
        layoutForRequest(request, "Tack", helpThanks("/app"), HELP_LAYOUT),
      );
    }
    const bugReport = query.topic === "technical";
    return reply.type("text/html").send(
      layoutForRequest(
        request,
        bugReport ? "Rapportera en bugg" : "Hjälp",
        helpForm(undefined, { topic: query.topic, from: query.from }),
        HELP_LAYOUT,
      ),
    );
  });

  app.post("/hjalp", async (request, reply) => {
    const body = (request.body ?? {}) as { topic?: string; message?: string; from?: string };
    if (
      !allowRequest(
        `feedback:${request.ip || "unknown"}`,
        FEEDBACK_RATE_LIMIT.limit,
        FEEDBACK_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).type("text/html").send(
        layoutForRequest(
          request,
          "Hjälp",
          helpForm("För många försök. Vänta en stund och prova igen.", body),
          HELP_LAYOUT,
        ),
      );
    }

    const topic = FEEDBACK_TOPICS.find((item) => item.value === body.topic);
    const message = body.message?.trim() ?? "";
    const from = readSupportPage(body.from);
    if (!topic || message.length < 4) {
      return reply.status(400).type("text/html").send(
        layoutForRequest(
          request,
          "Hjälp",
          helpForm("Välj ett ämne och skriv några rader.", {
            topic: body.topic,
            message: body.message,
            from,
          }),
          HELP_LAYOUT,
        ),
      );
    }

    const userId = await getReusableSessionUserId(getSessionUserId(request));
    const user = userId ? await getUserById(userId) : null;
    const contact = userId ? await getFeedbackReplyContact(userId) : null;
    const adminUrl = userId
      ? `${config.appBaseUrl.replace(/\/$/, "")}/admin/support/users/${userId}`
      : null;
    const text = [
      `Ämne: ${topic.label}`,
      `Namn: ${user?.displayName ?? "-"}`,
      `E-post: ${contact?.replyTo ?? "saknas"}`,
      `Inloggning: ${contact?.identityLines.join(", ") || "-"}`,
      `Användare: ${userId ?? "ej inloggad"}`,
      adminUrl ? `Konto: ${adminUrl}` : null,
      from ? `Sida: ${from}` : null,
      "",
      message.slice(0, 2000),
    ]
      .filter((line): line is string => line != null)
      .join("\n");

    try {
      if (config.resendApiKey) {
        await getMailer().send({
          to: "support@korpasset.se",
          subject: `Beta-feedback: ${topic.label}`,
          text,
          replyTo: contact?.replyTo ?? undefined,
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

    const dest = userId ? `/mer?${FEEDBACK_SENT_QUERY}` : `/hjalp?${FEEDBACK_SENT_QUERY}`;
    return reply.redirect(dest, 303);
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

  app.post("/api/client", async (request, reply) => {
    const sessionUserId = await getReusableSessionUserId(getSessionUserId(request));
    if (!sessionUserId) return reply.status(204).send();
    if (
      !allowRequest(
        `client-seen:${sessionUserId}`,
        60,
        10 * 60 * 1000,
      )
    ) {
      return reply.status(204).send();
    }
    const body = (request.body ?? {}) as {
      platform?: unknown;
      version?: unknown;
      build?: unknown;
    };
    await recordUserClient(sessionUserId, parseUserClientReport(body));
    return reply.status(204).send();
  });
}
