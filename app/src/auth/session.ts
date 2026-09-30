import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { UnauthorizedError } from "../errors.js";

export interface SessionData {
  userId: string;
  issuedAt: number;
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(userId: string): string {
  const data: SessionData = { userId, issuedAt: Date.now() };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string | undefined): SessionData | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionData;
    if (!data.userId || typeof data.userId !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, userId: string): void {
  const token = createSessionToken(userId);
  reply.setCookie(config.sessionCookieName, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.sessionCookieName, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
  });
}

export function setNativeAppCookie(reply: FastifyReply): void {
  reply.setCookie(config.nativeCookieName, "1", {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: config.cookieSecure,
    signed: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function isNativeAppRequest(request: FastifyRequest): boolean {
  return request.cookies[config.nativeCookieName] === "1";
}

/** Product surfaces the Capacitor shell can open, including deep links. */
export function isNativeProductPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (
    path === "/app" ||
    path === "/onboarding" ||
    path === "/konto" ||
    path === "/mer" ||
    path === "/resa" ||
    path === "/nasta" ||
    path === "/utveckling" ||
    path === "/hjalp" ||
    path === "/guide" ||
    path === "/logout"
  ) {
    return true;
  }
  return (
    path.startsWith("/app/") ||
    path.startsWith("/konto/") ||
    path.startsWith("/onboarding/") ||
    path.startsWith("/invite/") ||
    path.startsWith("/journey/") ||
    path.startsWith("/hjalp/") ||
    path.startsWith("/guide/")
  );
}

/** Public website cookie banner. Off inside the native app WebView. */
export function wantsPublicCookieConsent(request: FastifyRequest): boolean {
  return !isNativeAppRequest(request);
}

export function getSessionUserId(request: FastifyRequest): string | null {
  const token = request.cookies[config.sessionCookieName];
  const session = parseSessionToken(token);
  return session?.userId ?? null;
}

export function requireSessionUserId(request: FastifyRequest): string {
  const userId = getSessionUserId(request);
  if (!userId) {
    throw new UnauthorizedError("Session required");
  }
  return userId;
}

const LOGIN_RETURN = /^\/[A-Za-z0-9/_-]{1,200}$/;

/** In-app path to reopen after login. Never an external URL. */
export function safeLoginReturn(value: string | undefined | null): string {
  if (!value) return "/app";
  const path = value.trim().split("?")[0]?.split("#")[0] ?? "";
  if (!LOGIN_RETURN.test(path)) return "/app";
  if (
    path === "/app" ||
    path.startsWith("/app/") ||
    path.startsWith("/admin") ||
    path.startsWith("/api/") ||
    path === "/health" ||
    path.startsWith("/health/")
  ) {
    return "/app";
  }
  return path;
}

export function loginReturnFromQuery(query: unknown): string {
  if (!query || typeof query !== "object") return "/app";
  const next = (query as { next?: unknown }).next;
  return safeLoginReturn(typeof next === "string" ? next : undefined);
}

/** Logged-out browser navigation to a product URL. */
export function loginRedirectFor(requestUrl: string | undefined): string {
  const path = safeLoginReturn((requestUrl ?? "").split("?")[0]);
  if (path === "/app") return "/app";
  return `/app?next=${encodeURIComponent(path)}`;
}
