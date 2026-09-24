import { getPool } from "../db/pool.js";

/** Matches the public integritetspolicy: waitlist PII is kept at most 18 months. */
export const WAITLIST_RETENTION_MONTHS = 18;

/** Session advisory lock so two app processes cannot purge at once. */
const WAITLIST_RETENTION_LOCK_KEY = 180_018;

export interface WaitlistRetentionSummary {
  deletedCount: number;
  skipped: boolean;
}

/**
 * Delete waitlist rows whose signup is at least 18 months old.
 * Does not touch product users, journeys, or backups.
 */
export async function purgeExpiredWaitlistSignups(): Promise<WaitlistRetentionSummary> {
  const client = await getPool().connect();
  try {
    const locked = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [WAITLIST_RETENTION_LOCK_KEY],
    );
    if (!locked.rows[0]?.ok) {
      return { deletedCount: 0, skipped: true };
    }

    try {
      const deleted = await client.query(
        `DELETE FROM interest_signups
         WHERE created_at <= now() - ($1::int * interval '1 month')
         RETURNING id`,
        [WAITLIST_RETENTION_MONTHS],
      );
      return { deletedCount: deleted.rowCount ?? 0, skipped: false };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [
        WAITLIST_RETENTION_LOCK_KEY,
      ]);
    }
  } finally {
    client.release();
  }
}
