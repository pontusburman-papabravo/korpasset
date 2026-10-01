import type { FastifyInstance } from "fastify";
import { unsubscribeByToken } from "../services/marketing-preferences.js";
import { siteLayout } from "./layout.js";
import { siteHeader } from "./landing.js";
import { allowRequest } from "./rate-limit.js";

const UNSUBSCRIBE_RATE_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };

function unsubscribeShell(title: string, body: string): string {
  return siteLayout(
    title,
    `${siteHeader()}
     <main class="site-section site-section--cream">
       <div class="site-inner site-inner--narrow">
         ${body}
       </div>
     </main>
     <footer class="site-footer"><div class="site-inner"><p>Körpasset · Papa Bravo AB</p></div></footer>`,
    {
      robots: "noindex, nofollow",
      path: "/avregistrera",
      consent: false,
      description: "Avregistrering från nyheter och erbjudanden från Körpasset.",
    },
  );
}

function confirmedPage(): string {
  return unsubscribeShell(
    "Du är avregistrerad",
    `<h1>Du är avregistrerad</h1>
     <p>Du kommer inte längre att få nyheter och erbjudanden från Körpasset.</p>
     <p>Du kan ändra detta igen under Konto i Körpasset.</p>
     <p><a href="/konto">Öppna Konto</a></p>`,
  );
}

function invalidPage(): string {
  return unsubscribeShell(
    "Länken fungerar inte",
    `<h1>Länken fungerar inte</h1>
     <p>Avregistreringslänken är ogiltig. Om du fortfarande får nyhetsbrev kan du stänga av det under Konto i Körpasset.</p>
     <p><a href="/konto">Öppna Konto</a></p>`,
  );
}

export async function registerUnsubscribeRoutes(app: FastifyInstance): Promise<void> {
  async function handle(token: string, requestIp: string) {
    if (!allowRequest(`unsubscribe:${requestIp || "unknown"}`, UNSUBSCRIBE_RATE_LIMIT.limit, UNSUBSCRIBE_RATE_LIMIT.windowMs)) {
      return {
        status: 429,
        html: unsubscribeShell(
          "För många försök",
          `<h1>För många försök</h1>
           <p>Vänta en stund och öppna länken igen.</p>`,
        ),
      };
    }
    const ok = await unsubscribeByToken(token);
    return ok
      ? { status: 200, html: confirmedPage() }
      : { status: 404, html: invalidPage() };
  }

  app.get("/avregistrera/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await handle(token, request.ip);
    return reply.status(result.status).type("text/html").send(result.html);
  });

  app.post("/avregistrera/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const result = await handle(token, request.ip);
    return reply.status(result.status).type("text/html").send(result.html);
  });
}
