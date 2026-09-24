import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { getSessionUserId, setSessionCookie } from "../auth/session.js";
import {
  verifyIdentityToken,
  type OAuthProvider,
} from "../auth/oauth-verify.js";
import { continueWithOAuth } from "../services/oauth-accounts.js";
import { acceptInvitation } from "../services/invitations.js";
import { getUserById } from "../services/users.js";
import { signedInRedirectPath } from "./navigation.js";
import { allowRequest, OAUTH_RATE_LIMIT } from "./rate-limit.js";

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "apple" || value === "google";
}

export function parseInviteReturnTo(returnTo: string | undefined): string | null {
  if (!returnTo) return null;
  const match = returnTo.trim().match(/^\/invite\/([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}

export function appleAppSiteAssociation(): object {
  const appId = config.appleTeamId
    ? `${config.appleTeamId}.${config.appleBundleId}`
    : config.appleBundleId;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          paths: ["/invite/*", "/app", "/onboarding", "/konto"],
          components: [
            { "/": "/invite/*" },
            { "/": "/app" },
            { "/": "/onboarding" },
            { "/": "/konto" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: config.appleTeamId ? [appId] : [],
    },
  };
}

export function androidAssetLinks(): object[] {
  if (config.androidSha256CertFingerprints.length === 0) {
    return [];
  }
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: config.androidPackageName,
        sha256_cert_fingerprints: config.androidSha256CertFingerprints,
      },
    },
  ];
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
    request.log.error({ oauth: provider }, "oauth not configured");
    reply.status(503).send({ error: "Inloggning är inte konfigurerad ännu." });
    return;
  }

  const body = (request.body ?? {}) as {
    identityToken?: unknown;
    displayName?: unknown;
    returnTo?: unknown;
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
  const returnTo = typeof body.returnTo === "string" ? body.returnTo : undefined;

  const identity = await verifyIdentityToken(provider, identityToken, nonce);
  const result = await continueWithOAuth({
    provider,
    subject: identity.subject,
    displayName: displayName || identity.name,
    email: identity.email,
    sessionUserId: getSessionUserId(request),
  });
  setSessionCookie(reply, result.userId);

  let redirectTo = await signedInRedirectPath(result.userId);
  const inviteToken = parseInviteReturnTo(returnTo);
  if (inviteToken) {
    try {
      const user = await getUserById(result.userId);
      const accepted = await acceptInvitation(
        inviteToken,
        user?.displayName?.trim() || "Handledare",
        result.userId,
      );
      redirectTo = `/journey/${accepted.journeyId}`;
    } catch {
      redirectTo = `/invite/${inviteToken}`;
    }
  }

  reply.send({
    ok: true,
    redirectTo,
    created: result.created,
    claimedGuest: result.claimedGuest,
  });
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/.well-known/apple-app-site-association", async (_request, reply) => {
    return reply
      .header("cache-control", "public, max-age=3600")
      .type("application/json")
      .send(appleAppSiteAssociation());
  });

  app.get("/.well-known/assetlinks.json", async (_request, reply) => {
    return reply
      .header("cache-control", "public, max-age=3600")
      .type("application/json")
      .send(androidAssetLinks());
  });

  app.post("/api/auth/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!isOAuthProvider(provider)) {
      return reply.status(404).send({ error: "Not found" });
    }
    try {
      await continueFromToken(request, reply, provider);
    } catch (error) {
      if (error instanceof AppError) {
        request.log.warn(
          { oauth: provider, code: error.code, status: error.statusCode },
          "oauth failed",
        );
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      request.log.error({ err: error, oauth: provider }, "oauth continue failed");
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });
}
