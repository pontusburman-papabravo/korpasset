import { AppError } from "../errors.js";
import { getPool } from "../db/pool.js";

export const INTEREST_ROLES = [
  "student",
  "parent",
  "supervisor",
  "other",
] as const;

export const INTEREST_STATUSES = [
  "new",
  "contacted",
  "invited",
  "declined",
] as const;

export type InterestRole = (typeof INTEREST_ROLES)[number];
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export interface InterestSignup {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  role: InterestRole;
  city: string | null;
  message: string | null;
  platformIos: boolean;
  platformAndroid: boolean;
  status: InterestStatus;
  adminNote: string | null;
}

export interface InterestInput {
  name: string;
  email: string;
  role: string;
  city?: string;
  message?: string;
  platformIos?: boolean;
  platformAndroid?: boolean;
  honeypot?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRole(value: string): value is InterestRole {
  return (INTEREST_ROLES as readonly string[]).includes(value);
}

function isStatus(value: string): value is InterestStatus {
  return (INTEREST_STATUSES as readonly string[]).includes(value);
}

function mapRow(row: Record<string, unknown>): InterestSignup {
  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    name: String(row.name),
    email: String(row.email),
    role: row.role as InterestRole,
    city: row.city == null ? null : String(row.city),
    message: row.message == null ? null : String(row.message),
    platformIos: Boolean(row.platform_ios),
    platformAndroid: Boolean(row.platform_android),
    status: row.status as InterestStatus,
    adminNote: row.admin_note == null ? null : String(row.admin_note),
  };
}

export function formatInterestPlatforms(signup: Pick<InterestSignup, "platformIos" | "platformAndroid">): string {
  const labels: string[] = [];
  if (signup.platformIos) labels.push("iPhone");
  if (signup.platformAndroid) labels.push("Android");
  return labels.length > 0 ? labels.join(" · ") : "—";
}

export function validateInterestInput(input: InterestInput): {
  name: string;
  email: string;
  emailNormalized: string;
  role: InterestRole;
  city: string | null;
  message: string | null;
  platformIos: boolean;
  platformAndroid: boolean;
} {
  const name = input.name.trim();
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const city = input.city?.trim() || "";
  const message = input.message?.trim() || "";
  const platformIos = Boolean(input.platformIos);
  const platformAndroid = Boolean(input.platformAndroid);

  if (name.length < 1 || name.length > 80) {
    throw new AppError("Ange ditt namn", 400, "invalid_name");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized) || email.length > 120) {
    throw new AppError("Ange en giltig e-postadress", 400, "invalid_email");
  }
  if (!isRole(input.role)) {
    throw new AppError("Välj hur du är med i övningskörningen", 400, "invalid_role");
  }
  if (!platformIos && !platformAndroid) {
    throw new AppError("Kryssa i minst en: iPhone, Android eller båda", 400, "invalid_platform");
  }
  if (city.length > 80) {
    throw new AppError("Staden är för lång", 400, "invalid_city");
  }
  if (message.length > 1000) {
    throw new AppError("Meddelandet är för långt", 400, "invalid_message");
  }

  return {
    name,
    email,
    emailNormalized,
    role: input.role,
    city: city || null,
    message: message || null,
    platformIos,
    platformAndroid,
  };
}

export async function saveInterestSignup(
  input: InterestInput,
): Promise<{ signup: InterestSignup; created: boolean } | null> {
  if (input.honeypot?.trim()) {
    return null;
  }

  const data = validateInterestInput(input);
  const result = await getPool().query(
    `INSERT INTO interest_signups (
       name, email, email_normalized, role, city, message, platform_ios, platform_android
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (email_normalized) DO UPDATE SET
       name = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.name ELSE interest_signups.name END,
       email = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.email ELSE interest_signups.email END,
       role = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.role ELSE interest_signups.role END,
       city = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.city ELSE interest_signups.city END,
       message = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.message ELSE interest_signups.message END,
       platform_ios = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.platform_ios ELSE interest_signups.platform_ios END,
       platform_android = CASE WHEN interest_signups.status = 'new' THEN EXCLUDED.platform_android ELSE interest_signups.platform_android END,
       updated_at = CASE WHEN interest_signups.status = 'new' THEN now() ELSE interest_signups.updated_at END
     RETURNING *, (xmax = 0) AS inserted`,
    [
      data.name,
      data.email,
      data.emailNormalized,
      data.role,
      data.city,
      data.message,
      data.platformIos,
      data.platformAndroid,
    ],
  );

  const row = result.rows[0] as Record<string, unknown>;
  return {
    signup: mapRow(row),
    created: Boolean(row.inserted),
  };
}

export const INTEREST_PAGE_SIZE = 50;

export async function listInterestSignups(
  status?: InterestStatus,
  page?: { limit: number; offset: number },
): Promise<InterestSignup[]> {
  const params: unknown[] = [];
  let sql = `SELECT * FROM interest_signups`;
  if (status) {
    params.push(status);
    sql += ` WHERE status = $1`;
  }
  sql += ` ORDER BY created_at DESC, id DESC`;
  if (page) {
    params.push(page.limit);
    sql += ` LIMIT $${params.length}`;
    params.push(page.offset);
    sql += ` OFFSET $${params.length}`;
  }
  const result = await getPool().query(sql, params);
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function countInterestSignups(status?: InterestStatus): Promise<number> {
  const result = status
    ? await getPool().query(
        `SELECT count(*)::int AS count FROM interest_signups WHERE status = $1`,
        [status],
      )
    : await getPool().query(`SELECT count(*)::int AS count FROM interest_signups`);
  return result.rows[0]?.count ?? 0;
}

export async function countNewInterestSignups(): Promise<number> {
  const result = await getPool().query(
    `SELECT count(*)::int AS count FROM interest_signups WHERE status = 'new'`,
  );
  return result.rows[0]?.count ?? 0;
}

/** Unique waitlist rows in the first beta cohort. Duplicates cannot exist (`email_normalized`). Declined does not count. */
export const BETA_COHORT_SIZE = 25;

export async function countBetaWaitlist(): Promise<number> {
  const result = await getPool().query(
    `SELECT count(*)::int AS count
     FROM interest_signups
     WHERE status <> 'declined'`,
  );
  return result.rows[0]?.count ?? 0;
}

export async function getInterestSignup(id: string): Promise<InterestSignup | null> {
  const result = await getPool().query(
    `SELECT * FROM interest_signups WHERE id = $1`,
    [id],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function updateInterestSignup(
  id: string,
  patch: { status?: string; adminNote?: string },
): Promise<InterestSignup> {
  const current = await getInterestSignup(id);
  if (!current) {
    throw new AppError("Anmälan hittades inte", 404, "not_found");
  }

  const status = patch.status ?? current.status;
  if (!isStatus(status)) {
    throw new AppError("Ogiltig status", 400, "invalid_status");
  }

  const adminNote = patch.adminNote === undefined
    ? current.adminNote
    : patch.adminNote.trim() || null;
  if (adminNote && adminNote.length > 2000) {
    throw new AppError("Anteckningen är för lång", 400, "invalid_admin_note");
  }

  const result = await getPool().query(
    `UPDATE interest_signups
     SET status = $2, admin_note = $3, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, adminNote],
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function deleteInterestSignup(id: string): Promise<void> {
  const result = await getPool().query(
    `DELETE FROM interest_signups WHERE id = $1`,
    [id],
  );
  if (result.rowCount === 0) {
    throw new AppError("Anmälan hittades inte", 404, "not_found");
  }
}
