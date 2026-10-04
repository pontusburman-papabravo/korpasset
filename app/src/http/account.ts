import type { FastifyInstance } from "fastify";
import {
  clearSessionCookie,
  requireSessionUserId,
} from "../auth/session.js";
import { revokeAppleBeforeAccountDeletion } from "../services/apple-account.js";
import { deleteProductAccount } from "../services/account-lifecycle.js";
import { AppError } from "../errors.js";
import {
  listLinkedIdentities,
  providerLabel,
  type LinkedIdentity,
} from "../services/oauth-accounts.js";
import { getReusableSessionUserId, getUserById, updateDisplayName } from "../services/users.js";
import type { OAuthProvider } from "../auth/oauth-verify.js";
import {
  escapeHtml,
  errorBanner,
  layout,
  primaryButton,
  type AppLayoutOptions,
} from "./layout.js";
import { renderSignedInAs } from "./account-identity.js";
import { clearActiveJourneyCookie } from "./active-journey.js";
import { personalShareUrl } from "../services/share.js";
import {
  getMarketingEmailPreference,
  setMarketingEmailOptIn,
} from "../services/marketing-preferences.js";
import { appShareCard } from "./share-widget.js";

function deletedAccountPage(legacyAppleWithoutToken: boolean): string {
  const legacy = legacyAppleWithoutToken
    ? `<p>Körpasset kunde inte återkalla inloggningen hos Apple automatiskt för det här äldre kontot. Ta bort Körpasset under Inställningar → ditt namn → Inloggning och säkerhet → Logga in med Apple.</p>`
    : "";
  return layout(
    "Kontot raderat",
    `<h1>Kontot är raderat</h1>
     <p>Du kan stänga appen. Om du vill tillbaka senare skapar du ett nytt konto med Apple eller Google.</p>
     ${legacy}
     <a class="btn btn-secondary" href="/app">Till Körpasset</a>`,
  );
}

function providerRow(provider: OAuthProvider, linked: boolean): string {
  const label = providerLabel(provider);
  if (linked) {
    return `<li data-provider="${provider}" data-linked="true"><strong>${escapeHtml(label)}</strong> är kopplat.</li>`;
  }
  const id = provider === "apple" ? "continue-apple" : "continue-google";
  return `<li data-provider="${provider}" data-linked="false">
    <strong>${escapeHtml(label)}</strong> är inte kopplat.
    <button type="button" class="btn btn-secondary" id="${id}" data-oauth-provider="${provider}">Koppla ${escapeHtml(label)}</button>
  </li>`;
}

function accountPage(options: {
  displayName: string;
  linked: OAuthProvider[];
  identities: LinkedIdentity[];
  shareLink: string;
  marketingOptIn: boolean;
  errorMessage?: string;
  nav?: AppLayoutOptions;
}): string {
  const hasApple = options.linked.includes("apple");
  const hasGoogle = options.linked.includes("google");
  return layout(
    "Konto",
    `${options.errorMessage ? errorBanner(options.errorMessage) : ""}
     <h1>Konto</h1>
     <p class="muted">Här är du som person — inte en roll och inte en prenumeration.</p>
     ${renderSignedInAs({ displayName: options.displayName, identities: options.identities })}
     <form method="post" action="/konto/namn" class="stack">
       <div>
         <label for="name">Namn</label>
         <input id="name" name="name" type="text" required maxlength="80" autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(options.displayName)}">
       </div>
       ${primaryButton("Spara namn")}
     </form>
     <section class="card account-providers">
       <h2>Inloggning</h2>
       <p>Du kan koppla både Apple och Google till samma Körpasset-konto och använda båda för att logga in.</p>
       <p id="oauth-error" class="banner banner-error" hidden></p>
       <div id="oauth-google-reauth" class="stack" hidden>
         <p id="oauth-google-reauth-how" class="muted">Google avbröt efter kontoväljaren utan mejl och utan en ruta att godkänna. Tryck Fortsätt med Google igen. Samma sak en gång till betyder att Google nekar Körpasset på den här telefonen just nu — inte att du missat en knapp.</p>
       </div>
       <ul class="account-providers__list">
         ${providerRow("apple", hasApple)}
         ${providerRow("google", hasGoogle)}
       </ul>
     </section>
     ${appShareCard(options.shareLink)}
     <section class="card" data-marketing-email>
       <h2>Nyheter</h2>
       <p>Veckomejl om din egen körkortsresa är produktinformation och styrs inte av det här valet.</p>
       <form method="post" action="/konto/nyheter" class="stack">
         <label class="interest-choice">
           <input type="checkbox" name="marketing_email_opt_in" value="yes"${options.marketingOptIn ? " checked" : ""}>
           <span>Jag vill få nyheter, tips och erbjudanden från Körpasset via e-post.</span>
         </label>
         ${primaryButton("Spara nyheter")}
       </form>
     </section>
     <form method="post" action="/logout">
       <button type="submit" class="btn btn-secondary">Logga ut</button>
     </form>
     <p class="muted">För att byta till ett annat Körpasset-konto behöver du logga ut. Elev och handledare är roller i en körkortsresa, inte olika inloggningar.</p>
     <p class="muted"><a href="/integritet">Integritetspolicy</a> · <a href="/cookies">Cookies</a> · <a href="/villkor">Villkor</a> · <a href="#radera-konto">Radera konto</a></p>
     <section class="card account-delete" id="radera-konto">
       <h2>Radera konto</h2>
       <p>Om du är elev raderas din körkortsresa. Om du är handledare behålls historiken hos eleven, utan ditt namn och utan koppling till ditt konto. Utan appen: <a href="/radera-konto">begär radering på webben</a>.</p>
       <form method="post" action="/konto/radera" class="stack">
         <label for="confirm">Skriv RADERA för att bekräfta</label>
         <input id="confirm" name="confirm" type="text" autocomplete="off" required>
         ${primaryButton("Radera mitt konto")}
       </form>
     </section>`,
    { ...options.nav, activeTab: "mer" },
  );
}

async function renderAccountPage(
  userId: string,
  extras: { errorMessage?: string } = {},
): Promise<string> {
  const user = await getUserById(userId);
  const identities = await listLinkedIdentities(userId);
  return accountPage({
    displayName: user?.displayName ?? "",
    linked: identities.map((identity) => identity.provider),
    identities,
    shareLink: await personalShareUrl(userId, "app"),
    marketingOptIn: (await getMarketingEmailPreference(userId))?.optIn === true,
    errorMessage: extras.errorMessage,
  });
}

export async function registerAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/konto", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      clearActiveJourneyCookie(reply);
      return reply.redirect("/app");
    }
    return reply.type("text/html").send(await renderAccountPage(reusable));
  });

  app.post("/konto/namn", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const body = (request.body ?? {}) as { name?: string };
    const name = body.name?.trim() ?? "";
    if (!name) {
      return reply.status(400).type("text/html").send(
        await renderAccountPage(reusable, { errorMessage: "Ange ditt namn" }),
      );
    }
    await updateDisplayName(reusable, name);
    return reply.redirect("/konto");
  });

  app.post("/konto/nyheter", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const body = (request.body ?? {}) as { marketing_email_opt_in?: string };
    await setMarketingEmailOptIn(reusable, body.marketing_email_opt_in === "yes");
    return reply.redirect("/konto");
  });

  app.post("/konto/radera", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      return reply.redirect("/app");
    }
    const body = (request.body ?? {}) as { confirm?: string };
    if (body.confirm?.trim().toUpperCase() !== "RADERA") {
      return reply.status(400).type("text/html").send(
        await renderAccountPage(reusable, {
          errorMessage: "Skriv RADERA för att bekräfta.",
        }),
      );
    }
    let legacyAppleWithoutToken = false;
    try {
      const revoke = await revokeAppleBeforeAccountDeletion(reusable);
      legacyAppleWithoutToken = revoke.legacyAppleWithoutToken;
      await deleteProductAccount(reusable);
    } catch (error) {
      if (error instanceof AppError && error.code?.startsWith("apple_revoke_")) {
        request.log.warn({ code: error.code }, "apple revoke blocked account deletion");
        return reply.status(error.statusCode).type("text/html").send(
          await renderAccountPage(reusable, { errorMessage: error.message }),
        );
      }
      request.log.error({ err: error }, "account deletion failed");
      throw error;
    }
    clearSessionCookie(reply);
    clearActiveJourneyCookie(reply);
    return reply.type("text/html").send(deletedAccountPage(legacyAppleWithoutToken));
  });

  app.post("/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    clearActiveJourneyCookie(reply);
    return reply.redirect("/app");
  });
}
