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

export function sanitizeDisplayName(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

export async function continueWithOAuth(params: {
  provider: OAuthProvider;
  subject: string;
  displayName?: string | null;
  sessionUserId?: string | null;
}): Promise<ContinueWithOAuthResult> {
  const subject = params.subject.trim();
  if (!subject) {
    throw new AppError("Ogiltig inloggning", 401, "invalid_identity");
  }
  const displayName = sanitizeDisplayName(params.displayName);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT user_id FROM auth_identities
       WHERE provider = $1 AND provider_subject = $2
       FOR UPDATE`,
      [params.provider, subject],
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
      return { userId: ownerId, created: false, claimedGuest: false };
    }

    if (sessionUserId) {
      const sameProvider = await client.query(
        `SELECT provider_subject FROM auth_identities
         WHERE user_id = $1 AND provider = $2
         FOR UPDATE`,
        [sessionUserId, params.provider],
      );
      if ((sameProvider.rowCount ?? 0) > 0) {
        throw new ConflictError(
          "Det här Apple- eller Google-kontot hör redan till en annan användare.",
          "identity_on_other_user",
        );
      }

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

      await client.query(
        `INSERT INTO auth_identities (user_id, provider, provider_subject, verified_at)
         VALUES ($1, $2, $3, now())`,
        [sessionUserId, params.provider, subject],
      );

      const nextName = row.display_name?.trim() ? row.display_name : displayName;
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
      [displayName],
    );
    const userId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, verified_at)
       VALUES ($1, $2, $3, now())`,
      [userId, params.provider, subject],
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

export function providerLabel(provider: OAuthProvider): string {
  return provider === "apple" ? "Apple" : "Google";
}
