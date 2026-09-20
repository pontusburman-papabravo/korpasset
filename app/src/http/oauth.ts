import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import {
  clearSessionCookie,
  getSessionUserId,
  isNativeAppRequest,
  setNativeAppCookie,
  setSessionCookie,
} from "../auth/session.js";
import {
  verifyIdentityToken,
  type OAuthProvider,
} from "../auth/oauth-verify.js";
import {
  continueWithOAuth,
  listLinkedProviders,
  providerLabel,
} from "../services/oauth-accounts.js";
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import { acceptInvitation } from "../services/invitations.js";
import { deleteProductAccount } from "../services/account-lifecycle.js";
import { parseInviteReturnTo, signedInRedirectPath } from "./navigation.js";
import {
  escapeHtml,
  errorBanner,
  layout,
  primaryButton,
} from "./layout.js";
import { allowRequest, OAUTH_RATE_LIMIT } from "./rate-limit.js";

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "apple" || value === "google";
}

function publicOAuthConfig(): {
  appleClientId: string;
  googleWebClientId: string;
  googleIosClientId: string;
} {
  return {
    appleClientId: config.appleAudiences[0] ?? config.appleBundleId,
    googleWebClientId: config.googleWebClientId,
    googleIosClientId: config.googleIosClientId,
  };
}

export function oauthButtons(options: { returnTo?: string; lead?: string } = {}): string {
  const returnTo = options.returnTo ?? "/app";
  const lead =
    options.lead ??
    "Första gången skapas ditt konto. Nästa gång loggas du in.";
  return `<div class="oauth-stack" data-return-to="${escapeHtml(returnTo)}">
    <p class="muted">${escapeHtml(lead)}</p>
    <p id="oauth-error" class="banner banner-error" hidden></p>
    <button type="button" class="btn btn-apple" data-oauth-provider="apple">Fortsätt med Apple</button>
    <button type="button" class="btn btn-google" data-oauth-provider="google">Fortsätt med Google</button>
    <p class="muted oauth-web-hint">Konton skapas i iOS- och Android-appen, inte på webben.</p>
  </div>
  <script>window.KORPASSET_OAUTH = ${JSON.stringify(publicOAuthConfig())};</script>
  <script src="/app-oauth.js" defer></script>`;
}

function loginPage(errorMessage?: string): string {
  return layout(
    "Fortsätt med Apple eller Google",
    `${errorMessage ? errorBanner(errorMessage) : ""}
     <h1>Övningskör med en plan.</h1>
     <p>Fortsätt med Apple eller Google för att skapa konto eller logga in.</p>
     ${oauthButtons({ returnTo: "/app" })}`,
  );
}

function accountDeletedPage(): string {
  return layout(
    "Kontot är raderat",
    `<h1>Kontot är raderat</h1>
     <p>Ditt Körpasset-konto och inloggning är borttagna. Om du var handledare hos någon annan syns du där som tidigare handledare.</p>
     <p><a class="btn btn-secondary" href="/app">Tillbaka</a></p>`,
  );
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

  app.get("/app", async (request, reply) => {
    setNativeAppCookie(reply);
    const userId = await getReusableSessionUserId(getSessionUserId(request));
    if (userId) {
      return reply.redirect(await signedInRedirectPath(userId));
    }
    return reply.type("text/html").send(loginPage());
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
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      request.log.error({ err: error }, "oauth continue failed");
      return reply.status(500).send({ error: "Something went wrong" });
    }
  });

  app.get("/konto", async (request, reply) => {
    const sessionUserId = getSessionUserId(request);
    const userId = await getReusableSessionUserId(sessionUserId);
    if (!userId) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const user = await getUserById(userId);
    if (!user) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const providers = await listLinkedProviders(userId);
    const linked =
      providers.length > 0
        ? providers.map((provider) => providerLabel(provider)).join(" och ")
        : "Inget Apple- eller Google-konto kopplat ännu";

    return reply.type("text/html").send(
      layout(
        "Konto",
        `<h1>Konto</h1>
         <p>${escapeHtml(user.displayName ?? "Utan namn")}</p>
         <p class="muted">Inloggning: ${escapeHtml(linked)}</p>
         <form method="post" action="/logout">
           <button type="submit" class="btn btn-secondary">Logga ut</button>
         </form>
         <section class="card account-delete">
           <h2>Radera konto</h2>
           <p>Det tar bort din inloggning. Om du är elev raderas din körkortsresa. Om du är handledare behålls historiken hos eleven, utan ditt namn.</p>
           <form method="post" action="/konto/radera" class="stack">
             <label for="confirm">Skriv RADERA för att bekräfta</label>
             <input id="confirm" name="confirm" type="text" autocomplete="off" required>
             ${primaryButton("Radera mitt konto")}
           </form>
         </section>`,
      ),
    );
  });

  app.post("/konto/radera", async (request, reply) => {
    const sessionUserId = getSessionUserId(request);
    const userId = await getReusableSessionUserId(sessionUserId);
    if (!userId) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const body = (request.body ?? {}) as { confirm?: string };
    if ((body.confirm ?? "").trim() !== "RADERA") {
      const user = await getUserById(userId);
      const providers = await listLinkedProviders(userId);
      return reply.status(400).type("text/html").send(
        layout(
          "Konto",
          `${errorBanner("Skriv RADERA för att bekräfta.")}
           <h1>Konto</h1>
           <p>${escapeHtml(user?.displayName ?? "Utan namn")}</p>
           <p class="muted">Inloggning: ${escapeHtml(
             providers.map((provider) => providerLabel(provider)).join(" och ") ||
               "Inget Apple- eller Google-konto kopplat ännu",
           )}</p>`,
        ),
      );
    }

    try {
      await deleteProductAccount(userId);
      clearSessionCookie(reply);
      return reply.type("text/html").send(accountDeletedPage());
    } catch (error) {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).type("text/html").send(
          layout("Konto", errorBanner(error.message)),
        );
      }
      request.log.error({ err: error }, "account delete failed");
      return reply.status(500).type("text/html").send(
        layout("Konto", errorBanner("Kunde inte radera kontot")),
      );
    }
  });

  app.post("/logout", async (request, reply) => {
    clearSessionCookie(reply);
    const dest = isNativeAppRequest(request) ? "/app" : "/";
    return reply.redirect(dest);
  });
}
