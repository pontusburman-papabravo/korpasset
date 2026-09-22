import type { FastifyReply } from "fastify";
import { config } from "../config.js";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export function applySecurityHeaders(reply: FastifyReply): void {
  reply.header("x-content-type-options", "nosniff");
  reply.header("referrer-policy", "strict-origin-when-cross-origin");
  reply.header("x-frame-options", "DENY");
  reply.header(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  reply.header("content-security-policy", CONTENT_SECURITY_POLICY);
  if (config.cookieSecure) {
    reply.header(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }
}
