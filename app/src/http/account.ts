import type { FastifyInstance } from "fastify";
import {
  clearSessionCookie,
  requireSessionUserId,
} from "../auth/session.js";
import { deleteProductAccount } from "../services/account-lifecycle.js";
import {
  listLinkedProviders,
  providerLabel,
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
import { clearActiveJourneyCookie } from "./active-journey.js";

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
     <form method="post" action="/konto/namn" class="stack">
       <div>
         <label for="name">Namn</label>
         <input id="name" name="name" type="text" required maxlength="80" autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(options.displayName)}">
       </div>
       ${primaryButton("Spara namn")}
     </form>
     <section class="card account-providers">
       <h2>Inloggning</h2>
       <p>Du loggar in med Apple eller Google. Identitetsnyckel är provider <code>sub</code>, inte e-post. Du kan koppla båda till samma konto, men bara en Apple och en Google.</p>
       <p id="oauth-error" class="banner banner-error" hidden></p>
       <ul class="account-providers__list">
         ${providerRow("apple", hasApple)}
         ${providerRow("google", hasGoogle)}
       </ul>
     </section>
     <form method="post" action="/logout">
       <button type="submit" class="btn btn-secondary">Logga ut</button>
     </form>
     <p class="muted"><a href="/integritet">Integritetspolicy</a> · <a href="/villkor">Villkor</a> · <a href="/radera-konto">Radera konto</a></p>
     <section class="card account-delete">
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
  const linked = await listLinkedProviders(userId);
  return accountPage({
    displayName: user?.displayName ?? "",
    linked,
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
    await deleteProductAccount(reusable);
    clearSessionCookie(reply);
    clearActiveJourneyCookie(reply);
    return reply.type("text/html").send(
      layout(
        "Kontot raderat",
        `<h1>Kontot är raderat</h1>
         <p>Du kan stänga appen. Om du vill tillbaka senare skapar du ett nytt konto med Apple eller Google.</p>
         <a class="btn btn-secondary" href="/app">Till Körpasset</a>`,
      ),
    );
  });

  app.post("/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    clearActiveJourneyCookie(reply);
    return reply.redirect("/app");
  });
}
