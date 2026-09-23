import { AppError, ConflictError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import { getReusableSessionUserId, getUserById, isProductActorUsable } from "./users.js";
import type { OAuthProvider } from "../auth/oauth-verify.js";

export interface ContinueWithOAuthResult {
  userId: string;
  created: boolean;
  claimedGuest: boolean;
}

const DISPLAY_NAME_MAX = 80;
const IDENTITY_PROVIDER_SUBJECT_UNIQUE = "auth_identities_provider_subject_unique";
const USER_PROVIDER_UNIQUE = "auth_identities_one_apple_or_google_per_user";

export function sanitizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505" &&
    (error as { constraint?: string }).constraint === constraint
  );
}

function providerAlreadyLinkedError(provider: OAuthProvider): ConflictError {
  return new ConflictError(
    `${providerLabel(provider)} är redan kopplat till det här kontot.`,
    "provider_already_linked",
  );
}

export interface StoredIdentityEmail {
  email: string;
  emailNormalized: string;
}

/** Keep a provider-supplied address for admin and contact. Never use it as the login key. */
export function optionalIdentityEmail(
  value: string | null | undefined,
): StoredIdentityEmail | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > 120) return null;
  const emailNormalized = trimmed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) return null;
  return { email: trimmed, emailNormalized };
}

export async function continueWithOAuth(params: {
  provider: OAuthProvider;
  subject: string;
  displayName?: string | null;
  email?: string | null;
  sessionUserId?: string | null;
}): Promise<ContinueWithOAuthResult> {
  const subject = params.subject.trim();
  if (!subject) {
    throw new AppError("Ogiltig inloggning", 401, "invalid_identity");
  }
  const displayName = sanitizeDisplayName(params.displayName);
  const email = optionalIdentityEmail(params.email);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await continueWithOAuthInTransaction({
        provider: params.provider,
        subject,
        displayName,
        email,
        sessionUserId: params.sessionUserId,
      });
    } catch (error) {
      if (isUniqueViolation(error, USER_PROVIDER_UNIQUE)) {
        throw providerAlreadyLinkedError(params.provider);
      }
      if (
        isUniqueViolation(error, IDENTITY_PROVIDER_SUBJECT_UNIQUE) &&
        attempt === 0
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError("Kunde inte slutföra inloggningen", 409, "identity_conflict");
}

async function continueWithOAuthInTransaction(params: {
  provider: OAuthProvider;
  subject: string;
  displayName: string | null;
  email: StoredIdentityEmail | null;
  sessionUserId?: string | null;
}): Promise<ContinueWithOAuthResult> {
  return withTransaction(async (client) => {
    // SELECT FOR UPDATE on a missing identity row takes no lock.
    // Serialize this provider+subject for the rest of the transaction.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [`oauth-identity:${params.provider}`, params.subject],
    );

    const existing = await client.query(
      `SELECT user_id FROM auth_identities
       WHERE provider = $1 AND provider_subject = $2
       FOR UPDATE`,
      [params.provider, params.subject],
    );

    const sessionUserId = await getReusableSessionUserId(
      params.sessionUserId,
      client,
    );

    if ((existing.rowCount ?? 0) > 0) {
      const ownerId = String(existing.rows[0].user_id);
      if (sessionUserId && sessionUserId !== ownerId) {
        throw new ConflictError(
          "Det här Apple- eller Google-kontot hör redan till en annan användare.",
          "identity_on_other_user",
        );
      }
      const owner = await getUserById(ownerId, client);
      if (!owner || !isProductActorUsable(owner.accountState)) {
        throw new AppError("Kontot är inte tillgängligt", 403, "account_unavailable");
      }
      if (params.email) {
        await client.query(
          `UPDATE auth_identities
           SET email = $3, email_normalized = $4
           WHERE provider = $1 AND provider_subject = $2`,
          [
            params.provider,
            params.subject,
            params.email.email,
            params.email.emailNormalized,
          ],
        );
      }
      return { userId: ownerId, created: false, claimedGuest: false };
    }

    if (sessionUserId) {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        [`oauth-user-provider:${sessionUserId}`, params.provider],
      );

      const current = await client.query(
        `SELECT display_name, account_state FROM users WHERE id = $1 FOR UPDATE`,
        [sessionUserId],
      );
      const row = current.rows[0] as
        | { display_name: string | null; account_state: string }
        | undefined;
      if (!row) {
        throw new AppError("Användaren hittades inte", 404, "not_found");
      }

      const sameProvider = await client.query(
        `SELECT provider_subject FROM auth_identities
         WHERE user_id = $1 AND provider = $2
         FOR UPDATE`,
        [sessionUserId, params.provider],
      );
      if ((sameProvider.rowCount ?? 0) > 0) {
        throw providerAlreadyLinkedError(params.provider);
      }

      await client.query(
        `INSERT INTO auth_identities (
           user_id, provider, provider_subject, verified_at, email, email_normalized
         )
         VALUES ($1, $2, $3, now(), $4, $5)`,
        [
          sessionUserId,
          params.provider,
          params.subject,
          params.email?.email ?? null,
          params.email?.emailNormalized ?? null,
        ],
      );

      const nextName = row.display_name?.trim() ? row.display_name : params.displayName;
      await client.query(
        `UPDATE users
         SET account_state = 'active',
             display_name = COALESCE($2, display_name),
             updated_at = now()
         WHERE id = $1`,
        [sessionUserId, nextName],
      );

      return {
        userId: sessionUserId,
        created: false,
        claimedGuest: row.account_state === "guest",
      };
    }

    const created = await client.query(
      `INSERT INTO users (display_name, account_state)
       VALUES ($1, 'active')
       RETURNING id`,
      [params.displayName],
    );
    const userId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO auth_identities (
         user_id, provider, provider_subject, verified_at, email, email_normalized
       )
       VALUES ($1, $2, $3, now(), $4, $5)`,
      [
        userId,
        params.provider,
        params.subject,
        params.email?.email ?? null,
        params.email?.emailNormalized ?? null,
      ],
    );
    return { userId, created: true, claimedGuest: false };
  });
}

export async function listLinkedProviders(userId: string): Promise<OAuthProvider[]> {
  const result = await getPool().query(
    `SELECT provider FROM auth_identities
     WHERE user_id = $1 AND provider IN ('apple', 'google')
     ORDER BY created_at`,
    [userId],
  );
  return result.rows.map((row) => row.provider as OAuthProvider);
}

export async function findUserIdByIdentity(
  provider: OAuthProvider,
  subject: string,
): Promise<string | null> {
  const result = await getPool().query(
    `SELECT user_id FROM auth_identities
     WHERE provider = $1 AND provider_subject = $2
     LIMIT 1`,
    [provider, subject.trim()],
  );
  return result.rowCount ? String(result.rows[0].user_id) : null;
}

export async function unlinkProviderIdentity(
  userId: string,
  provider: OAuthProvider,
): Promise<number> {
  await getPool().query(
    `DELETE FROM auth_identities WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
  const remaining = await getPool().query(
    `SELECT count(*)::int AS n FROM auth_identities
     WHERE user_id = $1 AND provider IN ('apple', 'google')`,
    [userId],
  );
  return Number(remaining.rows[0]?.n ?? 0);
}

export function providerLabel(provider: OAuthProvider): string {
  return provider === "apple" ? "Apple" : "Google";
}
