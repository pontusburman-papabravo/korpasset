import { importPKCS8, SignJWT } from "jose";
import { config } from "../config.js";

/**
 * Sign in with Apple REST API.
 *
 * Token exchange: https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens
 * Revoke: https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens
 * Client secret: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 *
 * Native Körpasset uses the App ID (bundle id) as client_id. The iOS SDK
 * authorization request does not send redirect_uri, so the token request
 * must not send one either.
 *
 * Apple rejects a client secret whose exp is more than 15777000 seconds
 * (six months) ahead of the request. There is no shorter required TTL.
 * This module mints a secret per request, valid for five minutes, which
 * is inside that maximum.
 */

export const APPLE_TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_ENDPOINT = "https://appleid.apple.com/auth/revoke";
export const APPLE_CLIENT_SECRET_AUDIENCE = "https://appleid.apple.com";
export const APPLE_CLIENT_SECRET_MAX_TTL_SECONDS = 15_777_000;
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 300;

const APPLE_ERROR_CODES = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
]);

export type AppleTokenErrorKind =
  | "unconfigured"
  | "network"
  | "invalid_grant"
  | "rejected"
  | "unavailable"
  | "malformed";

/** Safe to log. Never carries the authorization code, refresh token, secret, or private key. */
export class AppleTokenError extends Error {
  constructor(
    readonly kind: AppleTokenErrorKind,
    readonly status: number | null,
    readonly appleError: string | null,
  ) {
    super(`apple_token_${kind}`);
    this.name = "AppleTokenError";
  }
}

type AppleHttp = (url: string, init: RequestInit) => Promise<Response>;

let httpOverride: AppleHttp | null = null;

export function setAppleTokenHttpForTests(http: AppleHttp | null): void {
  httpOverride = http;
}

export async function createAppleClientSecret(
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const teamId = config.appleTeamId;
  const keyId = config.appleKeyId;
  const privateKeyPem = config.applePrivateKey;
  const clientId = config.appleTokenClientId;
  if (!teamId || !keyId || !privateKeyPem || !clientId) {
    throw new AppleTokenError("unconfigured", null, null);
  }
  if (APPLE_CLIENT_SECRET_TTL_SECONDS > APPLE_CLIENT_SECRET_MAX_TTL_SECONDS) {
    throw new AppleTokenError("unconfigured", null, null);
  }

  let key: CryptoKey;
  try {
    key = await importPKCS8(privateKeyPem, "ES256");
  } catch {
    throw new AppleTokenError("unconfigured", null, null);
  }

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + APPLE_CLIENT_SECRET_TTL_SECONDS)
    .setAudience(APPLE_CLIENT_SECRET_AUDIENCE)
    .setSubject(clientId)
    .sign(key);
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
): Promise<string> {
  const code = authorizationCode.trim();
  if (!code) throw new AppleTokenError("malformed", null, null);
  const clientSecret = await createAppleClientSecret();
  const { status, body } = await appleFormPost(APPLE_TOKEN_ENDPOINT, {
    client_id: config.appleTokenClientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });
  if (status === 200) {
    const refreshToken = refreshTokenFrom(body);
    if (!refreshToken) throw new AppleTokenError("malformed", status, null);
    return refreshToken;
  }
  throw appleHttpError(status, body);
}

/**
 * Apple's revoke response: HTTP 200 with an empty body means the token
 * was revoked or was already invalid. HTTP 400 invalid_grant means the
 * refresh token itself is invalid. Callers that are deleting an account
 * may treat invalid_grant as already revoked. Other 400s and 5xx are not.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
): Promise<"revoked" | "already_invalid"> {
  const token = refreshToken.trim();
  if (!token) throw new AppleTokenError("malformed", null, null);
  const clientSecret = await createAppleClientSecret();
  const { status, body } = await appleFormPost(APPLE_REVOKE_ENDPOINT, {
    client_id: config.appleTokenClientId,
    client_secret: clientSecret,
    token,
    token_type_hint: "refresh_token",
  });
  if (status === 200) return "revoked";
  const error = appleHttpError(status, body);
  if (error.kind === "invalid_grant") return "already_invalid";
  throw error;
}

async function appleFormPost(
  url: string,
  fields: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const http = httpOverride ?? fetch;
  let response: Response;
  try {
    response = await http(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    throw new AppleTokenError("network", null, null);
  }
  const body = await response.text();
  return { status: response.status, body };
}

function refreshTokenFrom(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { refresh_token?: unknown };
    if (typeof parsed.refresh_token !== "string") return null;
    const token = parsed.refresh_token.trim();
    return token || null;
  } catch {
    return null;
  }
}

function appleHttpError(status: number, body: string): AppleTokenError {
  const appleError = appleErrorCode(body);
  if (status === 400 && appleError === "invalid_grant") {
    return new AppleTokenError("invalid_grant", status, appleError);
  }
  if (status >= 500) {
    return new AppleTokenError("unavailable", status, appleError);
  }
  return new AppleTokenError("rejected", status, appleError);
}

function appleErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    const code = typeof parsed.error === "string" ? parsed.error : "";
    return APPLE_ERROR_CODES.has(code) ? code : null;
  } catch {
    return null;
  }
}
