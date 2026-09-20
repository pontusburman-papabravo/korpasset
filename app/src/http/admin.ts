import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";
import {
  clearAdminCookie,
  getAdminFromRequest,
  setAdminCookie,
} from "../auth/admin.js";
import { config } from "../config.js";
import { csvCell } from "./csv.js";
import {
  ADMIN_RESET_NEUTRAL_MESSAGE,
  authenticateAdmin,
  countEnabledAdmins,
  requestAdminPasswordReset,
  resetAdminPassword,
  type AdminUser,
} from "../services/admin-users.js";
import { recordAdminAudit } from "../services/admin-audit.js";
import {
  getAdminBetaStats,
  listRecentInterestSignups,
} from "../services/admin-stats.js";
import {
  getSupportUserView,
  searchSupport,
} from "../services/admin-support.js";
import {
  deleteProductAccount,
  formatDeletionAuditSummary,
} from "../services/account-lifecycle.js";
import { EmailSendError, sendAdminResetEmail } from "../services/email.js";
import {
  INTEREST_PAGE_SIZE,
  INTEREST_STATUSES,
  countInterestSignups,
  countNewInterestSignups,
  deleteInterestSignup,
  formatInterestPlatforms,
  getInterestSignup,
  listInterestSignups,
  updateInterestSignup,
  type InterestStatus,
} from "../services/interest.js";
import { errorBanner, escapeHtml } from "./layout.js";
import {
  adminPage,
  forgotPage,
  loginPage,
  notConfigured,
  overviewPage,
  resetPage,
  signupDetailPage,
  signupsListPage,
  statistikPage,
  supportSearchPage,
  supportUserGonePage,
  supportUserPage,
} from "./admin-pages.js";
import {
  ADMIN_LOGIN_RATE_LIMIT,
  ADMIN_RESET_RATE_LIMIT,
  allowRequest,
} from "./rate-limit.js";

function clientKey(request: FastifyRequest, prefix: string): string {
  return `${prefix}:${request.ip || "unknown"}`;
}

function parseStatus(value: string | undefined): InterestStatus | undefined {
  return INTEREST_STATUSES.includes(value as InterestStatus)
    ? (value as InterestStatus)
    : undefined;
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return page;
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AdminUser | null> {
  if ((await countEnabledAdmins()) === 0) {
    const missing = notConfigured();
    await reply.status(missing.status).type("text/html").send(missing.html);
    return null;
  }
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    await reply.redirect("/admin/login");
    return null;
  }
  return admin;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const [stats, recent] = await Promise.all([
      getAdminBetaStats(),
      listRecentInterestSignups(5),
    ]);
    return reply.type("text/html").send(overviewPage({ stats, recent }));
  });

  app.get("/admin/login", async (request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    if (await getAdminFromRequest(request)) {
      return reply.redirect("/admin");
    }
    const query = request.query as { reset?: string };
    return reply.type("text/html").send(
      loginPage({
        successMessage:
          query.reset === "1" ? "Lösenordet är uppdaterat. Logga in med det nya lösenordet." : undefined,
      }),
    );
  });

  app.post("/admin/login", async (request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    if (
      !allowRequest(
        clientKey(request, "admin-login"),
        ADMIN_LOGIN_RATE_LIMIT.limit,
        ADMIN_LOGIN_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).type("text/html").send(
        loginPage({ errorMessage: "För många försök. Vänta en stund och prova igen." }),
      );
    }
    const body = request.body as { email?: string; password?: string };
    const admin = await authenticateAdmin(body.email ?? "", body.password ?? "");
    if (!admin) {
      return reply.status(401).type("text/html").send(
        loginPage({ errorMessage: "Fel e-post eller lösenord" }),
      );
    }
    setAdminCookie(reply, admin.id);
    return reply.redirect("/admin");
  });

  app.post("/admin/logout", async (_request, reply) => {
    clearAdminCookie(reply);
    return reply.redirect("/admin/login");
  });

  app.get("/admin/forgot-password", async (_request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    return reply.type("text/html").send(forgotPage());
  });

  app.post("/admin/forgot-password", async (request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    if (
      !allowRequest(
        clientKey(request, "admin-reset"),
        ADMIN_RESET_RATE_LIMIT.limit,
        ADMIN_RESET_RATE_LIMIT.windowMs,
      )
    ) {
      return reply.status(429).type("text/html").send(
        forgotPage({
          kind: "error",
          text: "För många försök. Vänta en stund och prova igen.",
        }),
      );
    }
    const body = request.body as { email?: string };
    const result = await requestAdminPasswordReset(body.email ?? "");
    if (result.created && result.rawToken && result.admin) {
      const resetUrl = `${config.appBaseUrl.replace(/\/$/, "")}/admin/reset-password?token=${encodeURIComponent(result.rawToken)}`;
      try {
        await sendAdminResetEmail(result.admin.email, resetUrl);
      } catch (error) {
        request.log.error(
          {
            err: error instanceof EmailSendError ? error.message : "email_send_failed",
            adminUserId: result.admin.id,
          },
          "admin password reset email failed",
        );
      }
    }
    return reply.type("text/html").send(
      forgotPage({ kind: "ok", text: ADMIN_RESET_NEUTRAL_MESSAGE }),
    );
  });

  app.get("/admin/reset-password", async (request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    const query = request.query as { token?: string };
    if (!query.token) {
      return reply.status(400).type("text/html").send(
        resetPage({ errorMessage: "Ogiltig eller utgången länk" }),
      );
    }
    return reply.type("text/html").send(resetPage({ token: query.token }));
  });

  app.post("/admin/reset-password", async (request, reply) => {
    if ((await countEnabledAdmins()) === 0) {
      const missing = notConfigured();
      return reply.status(missing.status).type("text/html").send(missing.html);
    }
    const body = request.body as { token?: string; password?: string; confirm?: string };
    if ((body.password ?? "") !== (body.confirm ?? "")) {
      return reply.status(400).type("text/html").send(
        resetPage({
          token: body.token,
          errorMessage: "Lösenorden matchar inte",
        }),
      );
    }
    try {
      await resetAdminPassword(body.token ?? "", body.password ?? "");
      return reply.redirect("/admin/login?reset=1");
    } catch (error) {
      const message =
        error instanceof AppError ? error.message : "Ogiltig eller utgången länk";
      return reply.status(400).type("text/html").send(
        resetPage({ token: body.token, errorMessage: message }),
      );
    }
  });

  app.get("/admin/signups", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;

    const query = request.query as { status?: string; page?: string };
    const status = parseStatus(query.status);
    const page = parsePage(query.page);
    const pageSize = INTEREST_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const [signups, newCount, total] = await Promise.all([
      listInterestSignups(status, { limit: pageSize, offset }),
      countNewInterestSignups(),
      countInterestSignups(status),
    ]);

    return reply.type("text/html").send(
      signupsListPage({
        signups,
        newCount,
        total,
        page,
        pageSize,
        status,
      }),
    );
  });

  app.get("/admin/signups.csv", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const query = request.query as { status?: string };
    const status = parseStatus(query.status);
    const signups = await listInterestSignups(status);
    const header = "created_at,name,email,role,platform,city,status,message";
    const lines = signups.map((signup) =>
      [
        signup.createdAt,
        csvCell(signup.name),
        csvCell(signup.email),
        signup.role,
        csvCell(formatInterestPlatforms(signup)),
        csvCell(signup.city ?? ""),
        signup.status,
        csvCell(signup.message ?? ""),
      ].join(","),
    );
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", "attachment; filename=korpasset-intresse.csv")
      .send([header, ...lines].join("\n"));
  });

  app.get("/admin/signups/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const signup = await getInterestSignup(id);
    if (!signup) {
      return reply.status(404).type("text/html").send(
        adminPage("Saknas", `<main class="admin-shell">${errorBanner("Anmälan hittades inte")}</main>`, {
          signedIn: true,
          nav: "signups",
        }),
      );
    }
    return reply.type("text/html").send(signupDetailPage(signup));
  });

  app.post("/admin/signups/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; admin_note?: string };
    try {
      const previous = await getInterestSignup(id);
      const updated = await updateInterestSignup(id, {
        status: body.status,
        adminNote: body.admin_note,
      });
      await recordAdminAudit({
        adminUserId: admin.id,
        operation: "waitlist_update",
        targetType: "interest_signup",
        targetId: id,
        summary: `status ${previous?.status ?? "?"} → ${updated.status}; note_set=${Boolean(updated.adminNote)}`,
      });
      return reply.redirect(`/admin/signups/${id}`);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Kunde inte spara";
      return reply.status(error instanceof AppError ? error.statusCode : 400).type("text/html").send(
        adminPage("Fel", `<main class="admin-shell">${errorBanner(message)}</main>`, {
          signedIn: true,
          nav: "signups",
        }),
      );
    }
  });

  app.post("/admin/signups/:id/delete", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { id } = request.params as { id: string };
    const body = request.body as { confirm?: string };
    if (body.confirm !== "yes") {
      return reply.status(400).type("text/html").send(
        adminPage(
          "Bekräfta radering",
          `<main class="admin-shell">${errorBanner("Bekräfta raderingen.")}<p><a href="/admin/signups/${escapeHtml(id)}">Tillbaka</a></p></main>`,
          { signedIn: true, nav: "signups" },
        ),
      );
    }
    try {
      const existing = await getInterestSignup(id);
      await deleteInterestSignup(id);
      await recordAdminAudit({
        adminUserId: admin.id,
        operation: "waitlist_delete",
        targetType: "interest_signup",
        targetId: id,
        summary: `deleted waitlist row email=${existing?.email ?? "unknown"}; product_user_untouched=true`,
      });
      return reply.redirect("/admin/signups");
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Kunde inte radera";
      return reply.status(error instanceof AppError ? error.statusCode : 400).type("text/html").send(
        adminPage("Fel", `<main class="admin-shell">${errorBanner(message)}</main>`, {
          signedIn: true,
          nav: "signups",
        }),
      );
    }
  });

  app.get("/admin/statistik", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const stats = await getAdminBetaStats();
    return reply.type("text/html").send(statistikPage(stats));
  });

  app.get("/admin/support", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const query = request.query as { q?: string; deleted?: string };
    const search = await searchSupport(query.q ?? "");
    return reply.type("text/html").send(
      supportSearchPage(search, {
        successMessage:
          query.deleted === "1" ? "Kontot är raderat enligt account-lifecycle." : undefined,
      }),
    );
  });

  app.get("/admin/support/users/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const view = await getSupportUserView(id);
    if (!view) {
      return reply.status(404).type("text/html").send(supportUserGonePage());
    }
    return reply.type("text/html").send(supportUserPage(view));
  });

  app.post("/admin/support/users/:id/delete-account", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { id } = request.params as { id: string };
    const body = request.body as {
      confirm_irreversible?: string;
      confirm_user_id?: string;
    };
    const view = await getSupportUserView(id);
    if (!view) {
      return reply.status(404).type("text/html").send(supportUserGonePage());
    }

    const typedId = (body.confirm_user_id ?? "").trim();
    if (body.confirm_irreversible !== "yes" || typedId !== id) {
      return reply.status(400).type("text/html").send(
        supportUserPage(view, {
          errorMessage: "Bekräfta den irreversibla operationen och skriv in rätt UUID.",
        }),
      );
    }

    try {
      const summary = await deleteProductAccount(id);
      await recordAdminAudit({
        adminUserId: admin.id,
        operation: "gdpr_delete_account",
        targetType: "user",
        targetId: id,
        summary: formatDeletionAuditSummary(summary),
      });
      return reply.redirect("/admin/support?deleted=1");
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Kunde inte radera kontot";
      return reply.status(error instanceof AppError ? error.statusCode : 400).type("text/html").send(
        supportUserPage(view, { errorMessage: message }),
      );
    }
  });
}
