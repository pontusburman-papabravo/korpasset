import { randomBytes } from "node:crypto";
import { getPool } from "../db/pool.js";

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const HANDOFF_REUSE_SECONDS = 30;
const CODE = /^[A-Za-z0-9_-]{20,128}$/;

export interface OAuthHandoff {
  userId: string;
  redirectTo: string;
}

function safeAppRedirect(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/app";
  if (path.includes("://") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) {
    return "/app";
  }
  if (path.length > 300) return "/app";
  return path;
}

export async function createOAuthHandoff(
  userId: string,
  redirectTo: string,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  const db = getPool();
  await db.query(`DELETE FROM oauth_handoffs WHERE expires_at < now()`);
  await db.query(
    `INSERT INTO oauth_handoffs (code, user_id, redirect_to, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, userId, safeAppRedirect(redirectTo), expiresAt],
  );
  return code;
}

/** Redeem a browser login into the app WebView.
 * The installed app loads the same URL more than once while it comes to
 * the foreground, so a just-used code stays valid for a few seconds.
 */
export async function redeemOAuthHandoff(code: string): Promise<OAuthHandoff | null> {
  if (!CODE.test(code)) return null;
  const result = await getPool().query(
    `UPDATE oauth_handoffs
     SET used_at = COALESCE(used_at, now())
     WHERE code = $1
       AND expires_at > now()
       AND (used_at IS NULL OR used_at > now() - make_interval(secs => $2))
     RETURNING user_id, redirect_to`,
    [code, HANDOFF_REUSE_SECONDS],
  );
  const row = result.rows[0] as { user_id?: string; redirect_to?: string } | undefined;
  if (!row?.user_id) return null;
  return {
    userId: row.user_id,
    redirectTo: safeAppRedirect(row.redirect_to || "/app"),
  };
}
