import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { getSessionUserId, setSessionCookie } from "../auth/session.js";
import {
  verifyIdentityToken,
  type OAuthProvider,
} from "../auth/oauth-verify.js";
import { rememberAppleRefreshTokenFromAuthorizationCode } from "../services/apple-account.js";
import { continueWithOAuth } from "../services/oauth-accounts.js";
import { acceptInvitation } from "../services/invitations.js";
import { getUserById } from "../services/users.js";
import { createOAuthHandoff } from "../services/oauth-handoff.js";
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

interface EstablishedOAuthLogin {
  userId: string;
  redirectTo: string;
  created: boolean;
  claimedGuest: boolean;
}

async function establishFromToken(
  request: FastifyRequest,
  reply: FastifyReply,
  provider: OAuthProvider,
): Promise<EstablishedOAuthLogin | null> {
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
    return null;
  }

  if (!config.isOAuthConfigured(provider)) {
    request.log.error({ oauth: provider }, "oauth not configured");
    reply.status(503).send({ error: "Inloggning är inte konfigurerad ännu." });
    return null;
  }

  const body = (request.body ?? {}) as {
    identityToken?: unknown;
    authorizationCode?: unknown;
    displayName?: unknown;
    returnTo?: unknown;
    nonce?: unknown;
  };
  const identityToken =
    typeof body.identityToken === "string" ? body.identityToken.trim() : "";
  if (!identityToken) {
    reply.status(400).send({ error: "identityToken saknas" });
    return null;
  }

  const nonce = typeof body.nonce === "string" ? body.nonce : undefined;
  const displayName =
    typeof body.displayName === "string" ? body.displayName : undefined;
  const returnTo = typeof body.returnTo === "string" ? body.returnTo : undefined;

  const authorizationCode =
    provider === "apple" && typeof body.authorizationCode === "string"
      ? body.authorizationCode.trim()
      : "";

  let stage: "verify" | "account" = "verify";
  let identity;
  let result;
  try {
    identity = await verifyIdentityToken(provider, identityToken, nonce);
    stage = "account";
    result = await continueWithOAuth({
      provider,
      subject: identity.subject,
      displayName: displayName || identity.name,
      email: identity.email,
      sessionUserId: getSessionUserId(request),
    });
  } catch (error) {
    if (error && typeof error === "object") {
      (error as { oauthStage?: "verify" | "account" }).oauthStage = stage;
    }
    throw error;
  }
  if (authorizationCode) {
    await rememberAppleRefreshTokenFromAuthorizationCode(
      identity.subject,
      authorizationCode,
      (fields, message) => {
        request.log.warn(fields, message);
      },
    );
  }
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

  return {
    userId: result.userId,
    redirectTo,
    created: result.created,
    claimedGuest: result.claimedGuest,
  };
}

function oauthFailureStage(error: unknown): "verify" | "account" {
  if (!error || typeof error !== "object" || !("oauthStage" in error)) return "verify";
  return error.oauthStage === "account" ? "account" : "verify";
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

  app.post("/api/auth/google/browser-handoff", async (request, reply) => {
    try {
      const established = await establishFromToken(request, reply, "google");
      if (!established) return;
      const handoff = await createOAuthHandoff(established.userId, established.redirectTo);
      request.log.info(
        { oauth: "google", created: established.created },
        "browser handoff created",
      );
      return reply.send({
        ok: true,
        handoff,
        created: established.created,
        claimedGuest: established.claimedGuest,
      });
    } catch (error) {
      return sendOAuthError(request, reply, "google", error);
    }
  });

  app.post("/api/auth/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (!isOAuthProvider(provider)) {
      return reply.status(404).send({ error: "Not found" });
    }
    try {
      const established = await establishFromToken(request, reply, provider);
      if (!established) return;
      setSessionCookie(reply, established.userId);
      return reply.send({
        ok: true,
        redirectTo: established.redirectTo,
        created: established.created,
        claimedGuest: established.claimedGuest,
      });
    } catch (error) {
      return sendOAuthError(request, reply, provider, error);
    }
  });
}

function sendOAuthError(
  request: FastifyRequest,
  reply: FastifyReply,
  provider: OAuthProvider,
  error: unknown,
) {
  const stage = oauthFailureStage(error);
  if (error instanceof AppError) {
    request.log.warn(
      { oauth: provider, code: error.code, status: error.statusCode, stage },
      "oauth failed",
    );
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
      stage,
    });
  }
  request.log.error(
    {
      oauth: provider,
      stage,
      errorName: error instanceof Error ? error.name : "unknown",
    },
    "oauth continue failed",
  );
  return reply.status(500).send({ error: "Something went wrong", stage });
}
