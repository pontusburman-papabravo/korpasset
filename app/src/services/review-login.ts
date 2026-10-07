import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";

const REVIEW_PROVIDER = "email_magic_link";

export function playReviewConfigured(): boolean {
  return config.playReviewEmail.includes("@") && config.playReviewPassword.length >= 8;
}

function sameSecret(left: string, right: string): boolean {
  const a = createHash("sha256").update(left, "utf8").digest();
  const b = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(a, b);
}

async function userIdForReviewSubject(subject: string): Promise<string> {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT u.id, u.account_state
       FROM auth_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = $1 AND i.provider_subject = $2
       FOR UPDATE`,
      [REVIEW_PROVIDER, subject],
    );
    const row = existing.rows[0] as { id: string; account_state: string } | undefined;
    if (row) {
      if (row.account_state === "suspended" || row.account_state === "deleted") {
        await client.query("ROLLBACK");
        return "";
      }
      if (row.account_state !== "active") {
        await client.query(
          `UPDATE users SET account_state = 'active', updated_at = now() WHERE id = $1`,
          [row.id],
        );
      }
      await client.query("COMMIT");
      return row.id;
    }
    const created = await client.query(
      `INSERT INTO users (display_name, account_state)
       VALUES ('Körpasset', 'active')
       RETURNING id`,
    );
    const userId = created.rows[0].id as string;
    await client.query(
      `INSERT INTO auth_identities (user_id, provider, provider_subject, verified_at)
       VALUES ($1, $2, $3, now())`,
      [userId, REVIEW_PROVIDER, subject],
    );
    await client.query("COMMIT");
    return userId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Returns the review user id, or null when the email or password does not match. */
export async function signInPlayReview(
  email: unknown,
  password: unknown,
): Promise<string | null> {
  if (!playReviewConfigured()) return null;
  const givenEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const givenPassword = typeof password === "string" ? password : "";
  const emailOk = sameSecret(givenEmail, config.playReviewEmail);
  const passwordOk = sameSecret(givenPassword, config.playReviewPassword);
  if (!emailOk || !passwordOk) return null;
  const userId = await userIdForReviewSubject(config.playReviewEmail);
  return userId || null;
}
