import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UnauthorizedError } from "../errors.js";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { clearSessionCookie, getSessionUserId } from "../auth/session.js";
import { rememberActiveJourney } from "./active-journey.js";
import { getReusableSessionUserId } from "../services/users.js";
import { redactRequestPath } from "./log.js";
import { missingSessionPage } from "./layout.js";
import { registerAdminRoutes } from "./admin.js";
import { registerMarketingRoutes } from "./marketing.js";
import { registerResendWebhook } from "./resend-webhook.js";
import { registerHelpRoutes } from "./help.js";
import { registerAccountRoutes } from "./account.js";
import { registerOAuthRoutes } from "./oauth.js";
import { registerAppleNotificationRoutes } from "./apple-notifications.js";
import { registerRoutes } from "./routes.js";
import { applySecurityHeaders } from "./security-headers.js";

function isStaticAssetPath(url: string | undefined): boolean {
  const path = (url ?? "").split("?")[0];
  return /\.(css|js|png|svg|jpe?g|ico|webp|woff2?|map)$/i.test(path);
}

function skipProductSessionCheck(url: string | undefined): boolean {
  const path = (url ?? "").split("?")[0];
  return (
    path === "/health" ||
    path.startsWith("/admin") ||
    path.startsWith("/api/resend") ||
    path.startsWith("/api/apple") ||
    isStaticAssetPath(path)
  );
}

function wantsJson(request: { headers: { accept?: string } }): boolean {
  const accept = request.headers.accept ?? "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function loggerOptions() {
  if (!isProduction() && process.env.LOG_LEVEL == null) {
    return false;
  }

  return {
    level: config.logLevel,
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers.referer",
        "req.headers.referrer",
        "req.body.identityToken",
        "req.body.payload",
      ],
      censor: "[redacted]",
    },
    serializers: {
      req(request: { method?: string; url?: string; ip?: string }) {
        return {
          method: request.method,
          url: redactRequestPath(request.url),
          remoteAddress: request.ip,
        };
      },
    },
  };
}

export async function buildServer() {
  const app = Fastify({
    logger: loggerOptions(),
    trustProxy: isProduction(),
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      if (typeof header === "string" && header.trim()) return header;
      return randomUUID();
    },
    requestIdHeader: "x-request-id",
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(fastifyStatic, {
    root: join(__dirname, "../../public"),
    prefix: "/",
  });

  app.addHook("preHandler", async (request, reply) => {
    if (skipProductSessionCheck(request.url)) return;
    const userId = getSessionUserId(request);
    if (!userId) return;
    const reusable = await getReusableSessionUserId(userId);
    if (!reusable) {
      delete request.cookies[config.sessionCookieName];
      clearSessionCookie(reply);
      return;
    }
    const path = (request.url ?? "").split("?")[0];
    const match = path.match(
      /^\/journey\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    if (match) {
      await rememberActiveJourney(request, reply, reusable, match[1]);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    applySecurityHeaders(reply);
    return payload;
  });

  app.get("/health", async (request, reply) => {
    try {
      await getPool().query("SELECT 1");
      return reply.send({
        status: "ok",
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error({ err: error }, "health check failed");
      return reply.status(503).send({
        status: "unhealthy",
        checkedAt: new Date().toISOString(),
      });
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (error instanceof UnauthorizedError || status === 401) {
      if (wantsJson(request)) {
        return reply.status(401).send({
          error: "Session required",
          requestId: request.id,
        });
      }
      return reply.status(401).type("text/html").send(missingSessionPage());
    }
    if (status >= 500) {
      request.log.error({ err: error }, "unhandled request error");
      return reply.status(500).send({
        error: "Something went wrong",
        requestId: request.id,
      });
    }
    return reply.status(status).send({
      error: error.message,
      requestId: request.id,
    });
  });

  await registerResendWebhook(app);
  await registerOAuthRoutes(app);
  await registerAppleNotificationRoutes(app);
  await registerHelpRoutes(app);
  await registerAccountRoutes(app);
  await registerMarketingRoutes(app);
  await registerAdminRoutes(app);
  await registerRoutes(app);
  return app;
}
