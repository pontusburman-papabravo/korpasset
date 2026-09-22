import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import { verifyAppleServerNotification } from "../auth/oauth-verify.js";
import { deleteProductAccount } from "../services/account-lifecycle.js";
import {
  findUserIdByIdentity,
  unlinkProviderIdentity,
} from "../services/oauth-accounts.js";
import { allowRequest, APPLE_NOTIFICATION_RATE_LIMIT } from "./rate-limit.js";

function payloadFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const payload = (body as { payload?: unknown }).payload;
  return typeof payload === "string" ? payload.trim() : "";
}

export async function registerAppleNotificationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post("/api/apple/notifications", async (request, reply) => {
    if (
      !allowRequest(
        `apple-notify:${request.ip || "unknown"}`,
        APPLE_NOTIFICATION_RATE_LIMIT.limit,
        APPLE_NOTIFICATION_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).send({ error: "För många försök." });
    }

    const payloadJwt = payloadFromBody(request.body);
    if (!payloadJwt) {
      return reply.status(400).send({ error: "payload saknas" });
    }

    try {
      const event = await verifyAppleServerNotification(payloadJwt);
      const userId = await findUserIdByIdentity("apple", event.sub);
      if (!userId) {
        request.log.info({ appleEvent: event.type }, "apple notification for unknown sub");
        return reply.send({ ok: true });
      }

      if (event.type === "account-delete") {
        try {
          await deleteProductAccount(userId);
        } catch (error) {
          if (!(error instanceof AppError && error.code === "already_deleted")) {
            throw error;
          }
        }
      } else if (event.type === "consent-revoked") {
        const remaining = await unlinkProviderIdentity(userId, "apple");
        if (remaining === 0) {
          try {
            await deleteProductAccount(userId);
          } catch (error) {
            if (!(error instanceof AppError && error.code === "already_deleted")) {
              throw error;
            }
          }
        }
      }

      request.log.info({ appleEvent: event.type }, "apple notification processed");
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      request.log.error({ err: error }, "apple notification failed");
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });
}
