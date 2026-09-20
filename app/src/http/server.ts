import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProduction } from "../config.js";
import { getPool } from "../db/pool.js";
import { redactRequestPath } from "./log.js";
import { registerAdminRoutes } from "./admin.js";
import { registerMarketingRoutes } from "./marketing.js";
import { registerResendWebhook } from "./resend-webhook.js";
import { registerOAuthRoutes } from "./oauth.js";
import { registerRoutes } from "./routes.js";

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

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
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
  await registerMarketingRoutes(app);
  await registerAdminRoutes(app);
  await registerRoutes(app);
  return app;
}
