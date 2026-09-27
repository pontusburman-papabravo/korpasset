import {
  AppleTokenError,
  exchangeAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from "../auth/apple-token.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import {
  appleIdentityRevokeState,
  storeAppleRefreshToken,
} from "./oauth-accounts.js";

type AppleAuthLog = (fields: Record<string, string | number | null>, message: string) => void;

/**
 * Exchanges a Sign in with Apple authorization code and stores the refresh
 * token on the Apple identity. A missing key, a rejected code, or Apple
 * being down does not fail login: the identity token is still the session
 * credential. Nothing about the code, secret, or token is logged.
 *
 * Revoke is not a no-op. Deletion of an identity that already has a refresh
 * token fails closed when the key is missing or Apple cannot be reached.
 */
export async function rememberAppleRefreshTokenFromAuthorizationCode(
  subject: string,
  authorizationCode: string,
  log: AppleAuthLog,
): Promise<void> {
  const code = authorizationCode.trim();
  if (!code) return;
  if (!config.isAppleTokenApiConfigured()) {
    log({ reason: "unconfigured" }, "apple_refresh_token_not_stored");
    return;
  }
  try {
    const refreshToken = await exchangeAppleAuthorizationCode(code);
    const stored = await storeAppleRefreshToken(subject, refreshToken);
    if (!stored) {
      log({ reason: "identity_missing" }, "apple_refresh_token_not_stored");
    }
  } catch (error) {
    log(appleTokenLogFields(error), "apple_refresh_token_not_stored");
  }
}

export interface AppleRevokeBeforeDeletion {
  /** Apple identity existed and no refresh token was stored. Revoke was not attempted. */
  legacyAppleWithoutToken: boolean;
}

/**
 * Calls Apple revoke before the local identity row (and its refresh token)
 * is deleted. No stored token: local deletion may continue, and the caller
 * must not claim that Apple revoked the authorization. Stored token: 200 or
 * invalid_grant (token already invalid) continues; missing config, network
 * errors, 5xx, and other 400s abort so the token stays for a retry.
 */
export async function revokeAppleBeforeAccountDeletion(
  userId: string,
): Promise<AppleRevokeBeforeDeletion> {
  const state = await appleIdentityRevokeState(userId);
  if (state.refreshTokens.length === 0) {
    return { legacyAppleWithoutToken: state.hasAppleIdentity };
  }
  if (!config.isAppleTokenApiConfigured()) {
    throw new AppError(
      "Kontot kunde inte raderas just nu eftersom Apple-återkallelsen inte är konfigurerad. Försök igen senare.",
      503,
      "apple_revoke_unconfigured",
    );
  }
  for (const token of state.refreshTokens) {
    try {
      await revokeAppleRefreshToken(token);
    } catch (error) {
      throw appleRevokeAppError(error);
    }
  }
  return { legacyAppleWithoutToken: false };
}

function appleTokenLogFields(error: unknown): Record<string, string | number | null> {
  if (error instanceof AppleTokenError) {
    return {
      reason: error.kind,
      status: error.status,
      appleError: error.appleError,
    };
  }
  return { reason: "unknown", status: null, appleError: null };
}

function appleRevokeAppError(error: unknown): AppError {
  if (error instanceof AppleTokenError && error.kind === "unconfigured") {
    return new AppError(
      "Kontot kunde inte raderas just nu eftersom Apple-återkallelsen inte är konfigurerad. Försök igen senare.",
      503,
      "apple_revoke_unconfigured",
    );
  }
  if (
    error instanceof AppleTokenError &&
    (error.kind === "network" || error.kind === "unavailable")
  ) {
    return new AppError(
      "Apple svarade inte. Kontot är kvar. Försök igen om en stund.",
      503,
      "apple_revoke_unavailable",
    );
  }
  return new AppError(
    "Apple avvisade återkallelsen. Kontot är kvar. Försök igen om en stund.",
    502,
    "apple_revoke_rejected",
  );
}
