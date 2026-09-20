import { createHash, timingSafeEqual } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { config } from "../config.js";
import { AppError } from "../errors.js";

export type OAuthProvider = "apple" | "google";

export interface VerifiedIdentity {
  provider: OAuthProvider;
  subject: string;
  email?: string;
  name?: string;
}

export type IdentityTokenVerifier = (
  provider: OAuthProvider,
  identityToken: string,
  nonce?: string,
) => Promise<VerifiedIdentity>;

const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

let verifierOverride: IdentityTokenVerifier | null = null;

export function setIdentityTokenVerifierForTests(
  verifier: IdentityTokenVerifier | null,
): void {
  verifierOverride = verifier;
}

export async function verifyIdentityToken(
  provider: OAuthProvider,
  identityToken: string,
  nonce?: string,
): Promise<VerifiedIdentity> {
  if (verifierOverride) {
    return verifierOverride(provider, identityToken, nonce);
  }
  if (provider === "apple") {
    return verifyAppleIdentityToken(identityToken, nonce);
  }
  return verifyGoogleIdentityToken(identityToken, nonce);
}

export async function verifySignedIdentityToken(options: {
  provider: OAuthProvider;
  token: string;
  jwks: JWTVerifyGetKey;
  issuer: string | string[];
  audience: string[];
  nonce?: string;
}): Promise<VerifiedIdentity> {
  if (options.audience.length === 0) {
    throw new AppError(
      `${options.provider === "apple" ? "Apple" : "Google"}-inloggning är inte konfigurerad`,
      503,
      "oauth_not_configured",
    );
  }

  const { payload } = await jwtVerify(options.token, options.jwks, {
    issuer: options.issuer,
    audience: options.audience,
    clockTolerance: 60,
  });
  assertNonce(payload, options.nonce);
  return identityFromPayload(options.provider, payload);
}

async function verifyAppleIdentityToken(
  token: string,
  nonce?: string,
): Promise<VerifiedIdentity> {
  try {
    return await verifySignedIdentityToken({
      provider: "apple",
      token,
      jwks: APPLE_JWKS,
      issuer: APPLE_ISSUER,
      audience: config.appleAudiences,
      nonce,
    });
  } catch (error) {
    throw asIdentityError(error, "Ogiltig Apple-inloggning");
  }
}

async function verifyGoogleIdentityToken(
  token: string,
  nonce?: string,
): Promise<VerifiedIdentity> {
  try {
    return await verifySignedIdentityToken({
      provider: "google",
      token,
      jwks: GOOGLE_JWKS,
      issuer: GOOGLE_ISSUERS,
      audience: config.googleAudiences,
      nonce,
    });
  } catch (error) {
    throw asIdentityError(error, "Ogiltig Google-inloggning");
  }
}

function identityFromPayload(
  provider: OAuthProvider,
  payload: JWTPayload,
): VerifiedIdentity {
  const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!subject) {
    throw new AppError("Ogiltig inloggning", 401, "invalid_identity");
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  return {
    provider,
    subject,
    email: email || undefined,
    name: name || undefined,
  };
}

function assertNonce(payload: JWTPayload, nonce?: string): void {
  const expected = nonce?.trim();
  if (!expected) return;
  const claimed = typeof payload.nonce === "string" ? payload.nonce : "";
  if (!claimed) {
    throw new AppError("Ogiltig inloggning", 401, "invalid_nonce");
  }
  if (safeEqual(claimed, expected)) return;
  const hashed = createHash("sha256").update(expected).digest("hex");
  if (safeEqual(claimed, hashed)) return;
  throw new AppError("Ogiltig inloggning", 401, "invalid_nonce");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function asIdentityError(error: unknown, message: string): AppError {
  if (error instanceof AppError) return error;
  return new AppError(message, 401, "invalid_identity");
}
