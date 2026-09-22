import type { FastifyInstance } from "fastify";
import {
  clearSessionCookie,
  requireSessionUserId,
} from "../auth/session.js";
import { deleteProductAccount } from "../services/account-lifecycle.js";
import {
  listUserJourneyMemberships,
  type JourneyMembership,
} from "../services/journeys.js";
import { getReusableSessionUserId, getUserById, updateDisplayName } from "../services/users.js";
import {
  escapeHtml,
  errorBanner,
  layout,
  primaryButton,
} from "./layout.js";

function membershipLabel(membership: JourneyMembership): string {
  if (membership.role === "student") {
    return "Elev · din körkortsresa";
  }
  return `Handledare · ${membership.studentName}`;
}

function accountPage(options: {
  displayName: string;
  memberships: JourneyMembership[];
  errorMessage?: string;
}): string {
  const membershipList =
    options.memberships.length > 0
      ? `<ul class="account-roles">
           ${options.memberships
             .map(
               (membership) =>
                 `<li><a href="/journey/${escapeHtml(membership.journeyId)}">${escapeHtml(membershipLabel(membership))}</a></li>`,
             )
             .join("")}
         </ul>`
      : `<p class="muted">Ingen körkortsresa ännu.</p>`;

  return layout(
    "Konto",
    `${options.errorMessage ? errorBanner(options.errorMessage) : ""}
     <h1>Konto</h1>
     <form method="post" action="/konto/namn" class="stack">
       <div>
         <label for="name">Namn</label>
         <input id="name" name="name" type="text" required maxlength="80" autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(options.displayName)}">
       </div>
       ${primaryButton("Spara namn")}
     </form>
     <section class="card">
       <h2>Dina resor</h2>
       <p>Du är en användare. Rollen är per resa: eleven äger körkortsresan, handledare deltar.</p>
       ${membershipList}
       <p><a href="/onboarding/handledare">Anslut till en elevresa</a></p>
     </section>
     <form method="post" action="/logout">
       <button type="submit" class="btn btn-secondary">Logga ut</button>
     </form>
     <p class="muted"><a href="/integritet">Integritetspolicy</a> · <a href="/villkor">Villkor</a> · <a href="/radera-konto">Radera konto</a></p>
     <section class="card account-delete">
       <h2>Radera konto</h2>
       <p>Om du är elev raderas din körkortsresa. Om du är handledare behålls historiken hos eleven, utan ditt namn. Utan appen: <a href="/radera-konto">begär radering på webben</a>.</p>
       <form method="post" action="/konto/radera" class="stack">
         <label for="confirm">Skriv RADERA för att bekräfta</label>
         <input id="confirm" name="confirm" type="text" autocomplete="off" required>
         ${primaryButton("Radera mitt konto")}
       </form>
     </section>`,
  );
}

export async function registerAccountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/konto", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      return reply.redirect("/");
    }
    const user = await getUserById(reusable);
    const memberships = await listUserJourneyMemberships(reusable);
    return reply.type("text/html").send(
      accountPage({ displayName: user?.displayName ?? "", memberships }),
    );
  });

  app.post("/konto/namn", async (request, reply) => {
    const userId = requireSessionUserId(request);
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      clearSessionCookie(reply);
      return reply.redirect("/");
    }
    const body = (request.body ?? {}) as { name?: string };
    const name = body.name?.trim() ?? "";
    if (!name) {
      const memberships = await listUserJourneyMemberships(reusable);
      return reply.status(400).type("text/html").send(
        accountPage({ displayName: "", memberships, errorMessage: "Ange ditt namn" }),
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
      return reply.redirect("/");
    }
    const body = (request.body ?? {}) as { confirm?: string };
    if (body.confirm?.trim().toUpperCase() !== "RADERA") {
      const user = await getUserById(reusable);
      const memberships = await listUserJourneyMemberships(reusable);
      return reply.status(400).type("text/html").send(
        accountPage({
          displayName: user?.displayName ?? "",
          memberships,
          errorMessage: "Skriv RADERA för att bekräfta.",
        }),
      );
    }
    await deleteProductAccount(reusable);
    clearSessionCookie(reply);
    return reply.type("text/html").send(
      layout(
        "Kontot raderat",
        `<h1>Kontot är raderat</h1>
         <p>Du kan stänga appen. Om du vill tillbaka senare skapar du ett nytt konto.</p>
         <a class="btn btn-secondary" href="/">Till startsidan</a>`,
      ),
    );
  });

  app.post("/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.redirect("/");
  });
}
