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
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import { attributeReferralSignup, platformFromUserAgent } from "../services/share.js";
import { readReferralCookie } from "./share.js";
import { createOAuthHandoff } from "../services/oauth-handoff.js";
import { signedInRedirectPath } from "./navigation.js";
import { signInPlayReview, playReviewConfigured } from "../services/review-login.js";
import { readOnboardingTrack } from "./onboarding-track.js";
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

  return completeOAuthLogin(request, provider, {
    identityToken,
    nonce,
    displayName,
    returnTo,
    authorizationCode,
  });
}

export function userAgentText(userAgent: string | string[] | undefined): string {
  return Array.isArray(userAgent) ? userAgent.join(" ") : userAgent || "";
}

export function isAndroidAppWebView(userAgent: string | string[] | undefined): boolean {
  const ua = userAgentText(userAgent);
  // Play reviews the installed app. Capacitor's Android WebView includes "wv".
  // Chrome and the website do not, so they keep Apple and Google.
  return /Android/i.test(ua) && /\bwv\b/.test(ua);
}

export function isExternalAndroidBrowser(userAgent: string | string[] | undefined): boolean {
  const ua = userAgentText(userAgent);
  if (!/Android/i.test(ua)) return false;
  // Capacitor's WebView includes "wv". Chrome, which Credential Manager
  // fallback opens, does not. That Chrome session cannot set the app cookie.
  return !/\bwv\b/.test(ua);
}

export function androidHandoffIntentUrl(code: string): string {
  const open = `https://korpasset.se/app?oauth_handoff=${code}`;
  return (
    `intent://korpasset.se/app?oauth_handoff=${code}` +
    `#Intent;scheme=https;package=${config.androidPackageName};S.browser_fallback_url=` +
    `${encodeURIComponent(open)};end`
  );
}

function androidHandoffPage(code: string): string {
  const intent = androidHandoffIntentUrl(code);
  const href = intent
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Öppna Körpasset</title>
</head>
<body>
  <p>Inloggningen är klar.</p>
  <p><a id="open-korpasset" href="${href}">Öppna Körpasset</a></p>
  <script>location.replace(${JSON.stringify(intent)});</script>
</body>
</html>`;
}

function parseGoogleOAuthState(state: string): { nonce: string; returnTo: string } {
  const raw = state.trim();
  const nonce = raw.split(".")[0] || "";
  const invite = raw.split(".")[1] || "";
  return {
    nonce,
    returnTo: parseInviteReturnTo(`/invite/${invite}`) ? `/invite/${invite}` : "/app",
  };
}

async function completeOAuthLogin(
  request: FastifyRequest,
  provider: OAuthProvider,
  input: {
    identityToken: string;
    nonce?: string;
    displayName?: string;
    returnTo?: string;
    authorizationCode?: string;
  },
): Promise<EstablishedOAuthLogin> {
  let stage: "verify" | "account" = "verify";
  let identity;
  let result;
  try {
    identity = await verifyIdentityToken(provider, input.identityToken, input.nonce);
    stage = "account";
    result = await continueWithOAuth({
      provider,
      subject: identity.subject,
      displayName: input.displayName || identity.name,
      email: identity.email,
      sessionUserId: getSessionUserId(request),
    });
  } catch (error) {
    if (error && typeof error === "object") {
      (error as { oauthStage?: "verify" | "account" }).oauthStage = stage;
    }
    throw error;
  }
  if (input.authorizationCode) {
    await rememberAppleRefreshTokenFromAuthorizationCode(
      identity.subject,
      input.authorizationCode,
      (fields, message) => {
        request.log.warn(fields, message);
      },
    );
  }
  if (result.created && !result.claimedGuest) {
    await attributeReferralSignup({
      newUserId: result.userId,
      cookieValue: readReferralCookie(request),
      platform: platformFromUserAgent(request.headers["user-agent"]),
    });
  }
  let redirectTo = await signedInRedirectPath(result.userId, readOnboardingTrack(request));
  const inviteToken = parseInviteReturnTo(input.returnTo);
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

  app.get("/api/auth/session", async (request, reply) => {
    reply.header("cache-control", "no-store, no-cache, must-revalidate");
    const sessionUserId = await getReusableSessionUserId(getSessionUserId(request));
    if (!sessionUserId) {
      return reply.send({ authenticated: false, redirectTo: null });
    }
    return reply.send({
      authenticated: true,
      redirectTo: await signedInRedirectPath(sessionUserId, readOnboardingTrack(request)),
    });
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

  // OpenID form_post from Google. Tokens stay in the POST body, never in a
  // GET URL or App Link. Success becomes a one-time oauth_handoff redirect
  // so the WebView can set its own session cookie.
  app.post("/app", async (request, reply) => {
    reply.header("cache-control", "no-store, no-cache, must-revalidate");
    const body = (request.body ?? {}) as {
      id_token?: unknown;
      state?: unknown;
      error?: unknown;
    };
    const oauthError = typeof body.error === "string" ? body.error.trim() : "";
    const identityToken = typeof body.id_token === "string" ? body.id_token.trim() : "";
    const state = typeof body.state === "string" ? body.state : "";
    const parsed = parseGoogleOAuthState(state);

    if (oauthError === "access_denied") {
      return reply.redirect("/app?oauth_error=cancelled");
    }
    if (!identityToken) {
      return reply.redirect("/app?oauth_error=failed");
    }
    if (
      !allowRequest(
        `oauth:google:${request.ip || "unknown"}`,
        OAUTH_RATE_LIMIT.limit,
        OAUTH_RATE_LIMIT.windowMs,
      ) ||
      !config.isOAuthConfigured("google")
    ) {
      return reply.redirect("/app?oauth_error=failed");
    }

    try {
      const established = await completeOAuthLogin(request, "google", {
        identityToken,
        nonce: parsed.nonce || undefined,
        returnTo: parsed.returnTo,
      });
      const handoff = await createOAuthHandoff(established.userId, established.redirectTo);
      request.log.info(
        { oauth: "google", created: established.created },
        "google form_post handoff created",
      );
      if (isExternalAndroidBrowser(request.headers["user-agent"])) {
        return reply.type("text/html; charset=utf-8").send(androidHandoffPage(handoff));
      }
      return reply.redirect(`/app?oauth_handoff=${encodeURIComponent(handoff)}`);
    } catch (error) {
      request.log.warn(
        {
          oauth: "google",
          stage: oauthFailureStage(error),
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "google form_post failed",
      );
      return reply.redirect("/app?oauth_error=failed");
    }
  });

  app.post("/api/auth/review-login", async (request, reply) => {
    if (!playReviewConfigured()) {
      return reply.status(404).send({ error: "Not found" });
    }
    const body = (request.body ?? {}) as { email?: unknown; password?: unknown };
    if (
      !allowRequest(
        `review-login:${request.ip || "unknown"}`,
        OAUTH_RATE_LIMIT.limit,
        OAUTH_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.redirect("/app?review_error=rate", 303);
    }
    const userId = await signInPlayReview(body.email, body.password);
    if (!userId) {
      request.log.info({ reviewLogin: false }, "play review login rejected");
      return reply.redirect("/app?review_error=credentials", 303);
    }
    setSessionCookie(reply, userId);
    request.log.info({ reviewLogin: true }, "play review login");
    return reply.redirect(await signedInRedirectPath(userId, readOnboardingTrack(request)), 303);
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
