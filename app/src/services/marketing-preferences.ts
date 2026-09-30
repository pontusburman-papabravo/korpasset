import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { getPool } from "../db/pool.js";

export interface MarketingEmailPreference {
  optIn: boolean;
  consentAt: string | null;
  optOutAt: string | null;
}

function isoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function marketingPreferenceFromRow(row: {
  marketing_email_opt_in?: unknown;
  marketing_email_consent_at?: unknown;
  marketing_email_opt_out_at?: unknown;
}): MarketingEmailPreference {
  return {
    optIn: row.marketing_email_opt_in === true,
    consentAt: isoOrNull(row.marketing_email_consent_at),
    optOutAt: isoOrNull(row.marketing_email_opt_out_at),
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const UNSUBSCRIBE_TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

export async function getMarketingEmailPreference(
  userId: string,
  client?: pg.Pool | pg.PoolClient,
): Promise<MarketingEmailPreference | null> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at
     FROM users
     WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return marketingPreferenceFromRow(row);
}

/**
 * Turning marketing on records consent and clears opt-out.
 * Turning it off records opt-out and leaves an earlier consent timestamp.
 * Saving the same value again does not move the timestamps.
 */
export async function setMarketingEmailOptIn(
  userId: string,
  optIn: boolean,
  client?: pg.Pool | pg.PoolClient,
): Promise<MarketingEmailPreference | null> {
  const db = client ?? getPool();
  const result = optIn
    ? await db.query(
        `UPDATE users
         SET marketing_email_opt_in = true,
             marketing_email_consent_at = CASE
               WHEN marketing_email_opt_in THEN marketing_email_consent_at
               ELSE now()
             END,
             marketing_email_opt_out_at = NULL,
             updated_at = now()
         WHERE id = $1 AND account_state <> 'deleted'
         RETURNING marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at`,
        [userId],
      )
    : await db.query(
        `UPDATE users
         SET marketing_email_opt_in = false,
             marketing_email_opt_out_at = CASE
               WHEN marketing_email_opt_in THEN now()
               ELSE marketing_email_opt_out_at
             END,
             updated_at = now()
         WHERE id = $1 AND account_state <> 'deleted'
         RETURNING marketing_email_opt_in, marketing_email_consent_at, marketing_email_opt_out_at`,
        [userId],
      );
  const row = result.rows[0];
  if (!row) return null;
  return marketingPreferenceFromRow(row);
}

export async function issueUnsubscribeToken(
  userId: string,
  client?: pg.Pool | pg.PoolClient,
): Promise<string> {
  const db = client ?? getPool();
  const rawToken = randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO marketing_unsubscribe_tokens (user_id, token_hash)
     VALUES ($1, $2)`,
    [userId, hashToken(rawToken)],
  );
  return rawToken;
}

/** True when the token matched a user. Repeated calls stay opted out. */
export async function unsubscribeByToken(rawToken: string): Promise<boolean> {
  if (!UNSUBSCRIBE_TOKEN_RE.test(rawToken)) return false;
  const result = await getPool().query(
    `SELECT user_id FROM marketing_unsubscribe_tokens WHERE token_hash = $1`,
    [hashToken(rawToken)],
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) return false;
  await setMarketingEmailOptIn(String(userId), false);
  return true;
}
