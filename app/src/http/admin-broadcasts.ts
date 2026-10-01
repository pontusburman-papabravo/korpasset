import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import { isUuid } from "../services/admin-support.js";
import { recordAdminAudit } from "../services/admin-audit.js";
import {
  countBroadcastRecipients,
  createEmailBroadcast,
  getEmailBroadcast,
  listEmailBroadcasts,
  parseBroadcastDraft,
  previewBroadcast,
  sendEmailBroadcast,
  sendTestBroadcast,
  updateEmailBroadcastDraft,
  type BroadcastDraftInput,
} from "../services/email-broadcasts.js";
import type { AdminUser } from "../services/admin-users.js";
import { EmailSendError } from "../services/email.js";
import {
  broadcastConfirmPage,
  broadcastFormPage,
  broadcastSentPage,
  broadcastsListPage,
  recipientLabel,
} from "./admin-broadcast-pages.js";
import { adminPage } from "./admin-pages.js";
import { errorBanner } from "./layout.js";

type RequireAdmin = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<AdminUser | null>;

interface PostedBroadcast {
  intent?: string;
  kind?: string;
  subject?: string;
  heading?: string;
  body?: string;
}

function postedValues(body: PostedBroadcast): {
  kind: string;
  subject: string;
  heading: string;
  body: string;
} {
  return {
    kind: body.kind === "service" ? "service" : "marketing",
    subject: body.subject ?? "",
    heading: body.heading ?? "",
    body: body.body ?? "",
  };
}

async function renderForm(
  values: { kind: string; subject: string; heading: string; body: string },
  extras: {
    id?: string;
    errorMessage?: string;
    successMessage?: string;
    previewSubject?: string;
    previewText?: string;
  } = {},
): Promise<string> {
  const [marketingCount, serviceCount] = await Promise.all([
    countBroadcastRecipients("marketing"),
    countBroadcastRecipients("service"),
  ]);
  return broadcastFormPage({
    ...values,
    ...extras,
    marketingCount,
    serviceCount,
  });
}

function failureStatus(error: unknown): number {
  if (error instanceof AppError) return error.statusCode;
  if (error instanceof EmailSendError) return 502;
  return 400;
}

function failureMessage(error: unknown): string {
  if (error instanceof AppError || error instanceof EmailSendError) return error.message;
  return "Kunde inte spara utskicket";
}

async function handleDraftPost(
  request: FastifyRequest,
  reply: FastifyReply,
  requireAdmin: RequireAdmin,
  broadcastId: string | null,
): Promise<void> {
  const admin = await requireAdmin(request, reply);
  if (!admin) return;
  const body = (request.body ?? {}) as PostedBroadcast;
  const values = postedValues(body);
  let input: BroadcastDraftInput;
  try {
    input = parseBroadcastDraft(body);
  } catch (error) {
    const html = await renderForm(values, {
      id: broadcastId ?? undefined,
      errorMessage: failureMessage(error),
    });
    await reply.status(failureStatus(error)).type("text/html").send(html);
    return;
  }

  const intent = body.intent ?? "save";
  if (intent === "preview" || intent === "test") {
    if (intent === "preview") {
      const preview = previewBroadcast(input);
      const html = await renderForm(values, {
        id: broadcastId ?? undefined,
        previewSubject: preview.subject,
        previewText: preview.text,
      });
      await reply.type("text/html").send(html);
      return;
    }
    try {
      await sendTestBroadcast(input, admin.email);
    } catch (error) {
      const html = await renderForm(values, {
        id: broadcastId ?? undefined,
        errorMessage: failureMessage(error),
      });
      await reply.status(failureStatus(error)).type("text/html").send(html);
      return;
    }
    const html = await renderForm(values, {
      id: broadcastId ?? undefined,
      successMessage: "Testmejl skickat till dig. Det räknas inte som ett riktigt utskick.",
    });
    await reply.type("text/html").send(html);
    return;
  }

  try {
    const saved = broadcastId
      ? await updateEmailBroadcastDraft(broadcastId, input)
      : await createEmailBroadcast(input, admin.id);
    if (intent === "send") {
      await reply.redirect(`/admin/utskick/${saved.id}/bekrafta`);
      return;
    }
    await reply.redirect(`/admin/utskick/${saved.id}?saved=1`);
  } catch (error) {
    const html = await renderForm(values, {
      id: broadcastId ?? undefined,
      errorMessage: failureMessage(error),
    });
    await reply.status(failureStatus(error)).type("text/html").send(html);
  }
}

export async function registerAdminBroadcastRoutes(
  app: FastifyInstance,
  requireAdmin: RequireAdmin,
): Promise<void> {
  app.get("/admin/utskick", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const broadcasts = await listEmailBroadcasts();
    return reply.type("text/html").send(broadcastsListPage(broadcasts));
  });

  app.get("/admin/utskick/ny", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const html = await renderForm({ kind: "marketing", subject: "", heading: "", body: "" });
    return reply.type("text/html").send(html);
  });

  app.post("/admin/utskick", async (request, reply) => {
    await handleDraftPost(request, reply, requireAdmin, null);
  });

  app.get("/admin/utskick/:id/bekrafta", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    const broadcast = await getEmailBroadcast(id);
    if (!broadcast || broadcast.status !== "draft") {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    const count = await countBroadcastRecipients(broadcast.kind);
    return reply.type("text/html").send(broadcastConfirmPage(broadcast, count));
  });

  app.post("/admin/utskick/:id/bekrafta", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    const broadcast = await getEmailBroadcast(id);
    if (!broadcast) {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    try {
      const result = await sendEmailBroadcast(id);
      await recordAdminAudit({
        adminUserId: admin.id,
        operation: "email_broadcast_send",
        targetType: "email_broadcast",
        targetId: id,
        summary: `kind=${broadcast.kind}; recipients=${result.recipientCount}; subject=${broadcast.subject.slice(0, 80)}`,
      });
      return reply.redirect(`/admin/utskick/${id}?sent=${result.recipientCount}`);
    } catch (error) {
      const fresh = await getEmailBroadcast(id);
      const message = failureMessage(error);
      if (!fresh || fresh.status !== "draft") {
        return reply
          .status(failureStatus(error))
          .type("text/html")
          .send(
            adminPage(
              "Utskick",
              `<main class="admin-shell">${errorBanner(message)}<p><a href="/admin/utskick">Tillbaka</a></p></main>`,
              { signedIn: true, nav: "utskick" },
            ),
          );
      }
      const count = await countBroadcastRecipients(fresh.kind);
      return reply
        .status(failureStatus(error))
        .type("text/html")
        .send(broadcastConfirmPage(fresh, count, message));
    }
  });

  app.get("/admin/utskick/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    const query = request.query as { saved?: string; sent?: string };
    const broadcast = await getEmailBroadcast(id);
    if (!broadcast) {
      return reply.status(404).type("text/html").send(missingBroadcast());
    }
    if (broadcast.status === "sent") {
      const preview = previewBroadcast(broadcast);
      const sentCount = Number.parseInt(query.sent ?? "", 10);
      const successMessage = Number.isFinite(sentCount)
        ? sentCount === 0
          ? "Inga mottagare hade tackat ja när mejlet skulle iväg. Inget mejl skickades."
          : `Mejlet är skickat till ${recipientLabel(sentCount)}.`
        : undefined;
      return reply
        .type("text/html")
        .send(broadcastSentPage(broadcast, preview.text, successMessage));
    }
    const html = await renderForm(
      {
        kind: broadcast.kind,
        subject: broadcast.subject,
        heading: broadcast.heading,
        body: broadcast.body,
      },
      {
        id: broadcast.id,
        successMessage: query.saved === "1" ? "Utkastet är sparat." : undefined,
      },
    );
    return reply.type("text/html").send(html);
  });

  app.post("/admin/utskick/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!isUuid(id)) {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      await reply.status(404).type("text/html").send(missingBroadcast());
      return;
    }
    await handleDraftPost(request, reply, requireAdmin, id);
  });
}

function missingBroadcast(): string {
  return adminPage(
    "Utskick",
    `<main class="admin-shell">${errorBanner("Utskicket hittades inte")}<p><a href="/admin/utskick">Tillbaka</a></p></main>`,
    { signedIn: true, nav: "utskick" },
  );
}
