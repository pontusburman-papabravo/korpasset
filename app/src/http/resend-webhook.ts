import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { stampMailReceipt } from "../services/mail-receipt.js";
import { logResendWebhookEvent } from "../services/resend-webhook-events.js";
import { verifyResendWebhook } from "./resend-webhook-verify.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const DELIVERY_PROBLEMS = new Set(["email.bounced", "email.complained", "email.failed"]);

async function handleResendWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const secret = config.resendWebhookSecret;
  if (!secret) {
    request.log.error("RESEND_WEBHOOK_SECRET is not configured");
    await reply.status(503).send({ error: "Webhook not configured" });
    return;
  }

  const rawBody = request.rawBody;
  if (typeof rawBody !== "string" || !rawBody) {
    await reply.status(400).send({ error: "Invalid signature" });
    return;
  }

  const event = verifyResendWebhook(rawBody, request.headers, secret);
  if (!event) {
    request.log.warn("resend webhook signature verification failed");
    await reply.status(400).send({ error: "Invalid signature" });
    return;
  }

  const eventType = event.type ?? "";
  const emailId = event.data?.email_id;
  const svixId = headerValue(request.headers, "svix-id");

  if (!emailId) {
    await reply.status(200).send({ received: true, skipped: "no email_id" });
    return;
  }

  try {
    await logResendWebhookEvent({
      eventType,
      emailId,
      svixId,
    });
    await stampMailReceipt({
      emailId,
      eventType,
      at: event.created_at,
    });
  } catch (error) {
    request.log.error(
      { err: error, eventType, emailId },
      "resend webhook persist failed",
    );
    await reply.status(500).send({ error: "Processing failed" });
    return;
  }

  if (DELIVERY_PROBLEMS.has(eventType)) {
    request.log.warn({ eventType, emailId }, "resend delivery problem");
  }

  await reply.status(200).send({ received: true });
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function registerResendWebhook(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (request, body, done) => {
        const raw = typeof body === "string" ? body : body.toString("utf8");
        request.rawBody = raw;
        try {
          done(null, JSON.parse(raw));
        } catch (error) {
          done(error as Error);
        }
      },
    );

    scope.post("/api/resend/webhook", handleResendWebhook);
  });
}
