import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { getSessionUserId, setSessionCookie } from "../auth/session.js";
import {
  verifyIdentityToken,
  type OAuthProvider,
} from "../auth/oauth-verify.js";
import { continueWithOAuth } from "../services/oauth-accounts.js";
import { signedInRedirectPath } from "./navigation.js";
import { allowRequest, OAUTH_RATE_LIMIT } from "./rate-limit.js";

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "apple" || value === "google";
}

async function continueFromToken(
  request: FastifyRequest,
  reply: FastifyReply,
  provider: OAuthProvider,
): Promise<void> {
  if (
    !allowRequest(
      `oauth:${provider}:${request.ip || "unknown"}`,
      OAUTH_RATE_LIMIT.limit,
      OAUTH_RATE_LIMIT.windowMs,
    )
  ) {
    reply.status(429).send({
      error: "För många försök. Vänta en stund och prova igen.",
    });
    return;
  }

  if (!config.isOAuthConfigured(provider)) {
    reply.status(503).send({ error: "Inloggning är inte konfigurerad ännu." });
    return;
  }

  const body = (request.body ?? {}) as {
    identityToken?: unknown;
    displayName?: unknown;
    nonce?: unknown;
  };
  const identityToken =
    typeof body.identityToken === "string" ? body.identityToken.trim() : "";
  if (!identityToken) {
    reply.status(400).send({ error: "identityToken saknas" });
    return;
  }

  const nonce = typeof body.nonce === "string" ? body.nonce : undefined;
  const displayName =
    typeof body.displayName === "string" ? body.displayName : undefined;

  const identity = await verifyIdentityToken(provider, identityToken, nonce);
  const result = await continueWithOAuth({
    provider,
    subject: identity.subject,
    displayName: displayName || identity.name,
    sessionUserId: getSessionUserId(request),
  });
  setSessionCookie(reply, result.userId);

  reply.send({
    ok: true,
    redirectTo: await signedInRedirectPath(result.userId),
    created: result.created,
    claimedGuest: result.claimedGuest,
  });
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!isOAuthProvider(provider)) {
      return reply.status(404).send({ error: "Not found" });
    }
    try {
      await continueFromToken(request, reply, provider);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      request.log.error({ err: error }, "oauth continue failed");
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });
}
