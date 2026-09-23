import { AppError, NotFoundError } from "../errors.js";
import { getPool } from "../db/pool.js";
import { optionalIdentityEmail, sanitizeDisplayName } from "./oauth-accounts.js";

export const DIRECTORY_PAGE_SIZE = 50;

export const DIRECTORY_ACCOUNT_STATES = ["guest", "active", "suspended", "deleted"] as const;
export type DirectoryAccountState = (typeof DIRECTORY_ACCOUNT_STATES)[number];

export const EDITABLE_ACCOUNT_STATES = ["guest", "active", "suspended"] as const;
export type EditableAccountState = (typeof EDITABLE_ACCOUNT_STATES)[number];

export interface DirectoryIdentity {
  provider: string;
  providerSubject: string;
  email: string | null;
}

export interface DirectoryUser {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
  accountState: string;
  createdAt: string;
  emails: string[];
  providers: string[];
  roles: Array<"student" | "supervisor">;
  identities: DirectoryIdentity[];
}

export function isDirectoryAccountState(value: string | undefined): value is DirectoryAccountState {
  return DIRECTORY_ACCOUNT_STATES.includes(value as DirectoryAccountState);
}

export function isEditableAccountState(value: string | undefined): value is EditableAccountState {
  return EDITABLE_ACCOUNT_STATES.includes(value as EditableAccountState);
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function addEmail(emails: string[], seen: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  emails.push(trimmed);
}

export function collectUserEmails(
  contactEmail: string | null,
  identities: DirectoryIdentity[],
): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  addEmail(emails, seen, contactEmail);
  for (const identity of identities) {
    addEmail(emails, seen, identity.email);
    if (identity.provider === "email_magic_link" && identity.providerSubject.includes("@")) {
      addEmail(emails, seen, identity.providerSubject);
    }
  }
  return emails;
}

function directoryFilter(input: { q?: string; state?: string }): {
  where: string;
  params: unknown[];
} {
  const q = (input.q ?? "").trim().slice(0, 120);
  const state = isDirectoryAccountState(input.state) ? input.state : null;
  return {
    where: `WHERE ($1::text IS NULL OR u.account_state::text = $1)
      AND (
        $2::text IS NULL
        OR u.display_name ILIKE $3 ESCAPE '\\'
        OR u.id::text ILIKE $3 ESCAPE '\\'
        OR COALESCE(u.contact_email, '') ILIKE $3 ESCAPE '\\'
        OR COALESCE(u.contact_email_normalized, '') ILIKE $3 ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM auth_identities a
          WHERE a.user_id = u.id
            AND (
              COALESCE(a.email, '') ILIKE $3 ESCAPE '\\'
              OR COALESCE(a.email_normalized, '') ILIKE $3 ESCAPE '\\'
              OR a.provider_subject ILIKE $3 ESCAPE '\\'
            )
        )
      )`,
    params: [state, q || null, q ? `%${escapeLike(q)}%` : null],
  };
}

function mapIdentity(row: Record<string, unknown>): DirectoryIdentity {
  return {
    provider: String(row.provider),
    providerSubject: String(row.provider_subject),
    email: row.email == null ? null : String(row.email),
  };
}

async function hydrateUsers(
  rows: Array<Record<string, unknown>>,
): Promise<DirectoryUser[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => String(row.id));
  const identities = await getPool().query(
    `SELECT user_id, provider, provider_subject, email
     FROM auth_identities
     WHERE user_id = ANY($1::uuid[])
     ORDER BY created_at, provider`,
    [ids],
  );
  const byUser = new Map<string, DirectoryIdentity[]>();
  for (const row of identities.rows) {
    const userId = String(row.user_id);
    const list = byUser.get(userId) ?? [];
    list.push(mapIdentity(row as Record<string, unknown>));
    byUser.set(userId, list);
  }

  return rows.map((row) => {
    const id = String(row.id);
    const deleted = String(row.account_state) === "deleted";
    const contactEmail = deleted || row.contact_email == null ? null : String(row.contact_email);
    const userIdentities = deleted ? [] : (byUser.get(id) ?? []);
    const roles: DirectoryUser["roles"] = [];
    if (row.is_student) roles.push("student");
    if (row.is_supervisor) roles.push("supervisor");
    return {
      id,
      displayName: deleted || row.display_name == null ? null : String(row.display_name),
      contactEmail,
      accountState: String(row.account_state),
      createdAt: new Date(String(row.created_at)).toISOString(),
      emails: collectUserEmails(contactEmail, userIdentities),
      providers: [...new Set(userIdentities.map((identity) => identity.provider))],
      roles,
      identities: userIdentities,
    };
  });
}

const USER_SELECT = `SELECT u.id, u.display_name, u.contact_email, u.account_state, u.created_at,
            EXISTS (SELECT 1 FROM driving_journeys j WHERE j.student_user_id = u.id) AS is_student,
            EXISTS (
              SELECT 1 FROM journey_collaborators jc
              WHERE jc.user_id = u.id AND jc.role = 'supervisor'
            ) AS is_supervisor
     FROM users u`;

export async function listDirectoryUsers(input: {
  q?: string;
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: DirectoryUser[]; total: number }> {
  const { where, params } = directoryFilter(input);
  const count = await getPool().query(
    `SELECT count(*)::int AS count FROM users u ${where}`,
    params,
  );
  const listParams = [...params];
  let sql = `${USER_SELECT} ${where} ORDER BY u.created_at DESC, u.id DESC`;
  if (input.limit != null) {
    listParams.push(input.limit);
    sql += ` LIMIT $${listParams.length}`;
    listParams.push(input.offset ?? 0);
    sql += ` OFFSET $${listParams.length}`;
  }
  const result = await getPool().query(sql, listParams);
  return {
    users: await hydrateUsers(result.rows as Array<Record<string, unknown>>),
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function getDirectoryUser(userId: string): Promise<DirectoryUser | null> {
  const result = await getPool().query(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const [user] = await hydrateUsers([row]);
  return user ?? null;
}

export async function updateDirectoryUser(
  userId: string,
  input: { displayName: string; contactEmail: string; accountState: string },
): Promise<DirectoryUser> {
  if (!isEditableAccountState(input.accountState)) {
    throw new AppError("Ogiltig kontostatus", 400, "invalid_account_state");
  }
  const email = input.contactEmail.trim();
  let contactEmail: string | null = null;
  let contactEmailNormalized: string | null = null;
  if (email) {
    const stored = optionalIdentityEmail(email);
    if (!stored) {
      throw new AppError("Ange en giltig e-postadress", 400, "invalid_email");
    }
    contactEmail = stored.email;
    contactEmailNormalized = stored.emailNormalized;
  }

  const result = await getPool().query(
    `UPDATE users
     SET display_name = $2,
         contact_email = $3,
         contact_email_normalized = $4,
         account_state = $5::account_state,
         updated_at = now()
     WHERE id = $1 AND account_state <> 'deleted'
     RETURNING id`,
    [
      userId,
      sanitizeDisplayName(input.displayName),
      contactEmail,
      contactEmailNormalized,
      input.accountState,
    ],
  );
  if ((result.rowCount ?? 0) === 0) {
    const existing = await getPool().query(
      `SELECT account_state FROM users WHERE id = $1`,
      [userId],
    );
    if ((existing.rowCount ?? 0) === 0) {
      throw new NotFoundError("Användaren hittades inte");
    }
    throw new AppError("Ett raderat konto kan inte ändras", 409, "already_deleted");
  }
  const updated = await getDirectoryUser(userId);
  if (!updated) throw new NotFoundError("Användaren hittades inte");
  return updated;
}
