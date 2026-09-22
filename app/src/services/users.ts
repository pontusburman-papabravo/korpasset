import type pg from "pg";
import { getPool } from "../db/pool.js";

export interface User {
  id: string;
  displayName: string | null;
  accountState: string;
}

export async function createGuestUser(
  displayName: string,
  client?: pg.PoolClient,
): Promise<User> {
  const db = client ?? getPool();
  const result = await db.query(
    `INSERT INTO users (display_name, account_state)
     VALUES ($1, 'guest')
     RETURNING id, display_name, account_state`,
    [displayName.trim()],
  );
  const row = result.rows[0];
  return {
    id: row.id,
    displayName: row.display_name,
    accountState: row.account_state,
  };
}

export async function getUserById(
  userId: string,
  client?: pg.PoolClient,
): Promise<User | null> {
  const db = client ?? getPool();
  const result = await db.query(
    `SELECT id, display_name, account_state FROM users WHERE id = $1`,
    [userId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    displayName: row.display_name,
    accountState: row.account_state,
  };
}

export function isProductActorUsable(
  accountState: string | null | undefined,
): boolean {
  return accountState === "guest" || accountState === "active";
}

/** Session cookies survive tombstoning; never reuse a deleted or suspended actor. */
export async function getReusableSessionUserId(
  userId: string | null | undefined,
  client?: pg.PoolClient,
): Promise<string | null> {
  if (!userId) return null;
  const user = await getUserById(userId, client);
  if (!user || !isProductActorUsable(user.accountState)) return null;
  return user.id;
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
  client?: pg.PoolClient,
): Promise<void> {
  const db = client ?? getPool();
  await db.query(
    `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
    [userId, displayName.trim()],
  );
}
