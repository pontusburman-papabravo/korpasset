import { getPool } from "../db/pool.js";

export interface AccountWeeklyEmail {
  journeyId: string;
  weekKey: string;
  template: string;
  status: "sending" | "sent" | "failed";
  at: string;
  error: string | null;
  providerMessageId: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
}

export interface RecentProductMail {
  kind: "help" | "weekly";
  accountId: string;
  displayName: string | null;
  accountState: string;
  detail: string;
  status: "sending" | "sent" | "failed";
  at: string;
  journeyId: string | null;
  providerMessageId: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
}

const WEEKLY_FOR_ACCOUNT_SQL = `
  SELECT journey_id, week_key, template, status, sent_at, updated_at, error,
         provider_message_id, delivered_at, opened_at, bounced_at
  FROM journey_weekly_emails
  WHERE account_id = $1
  ORDER BY created_at DESC
`;

export async function listAccountWeeklyEmails(accountId: string): Promise<AccountWeeklyEmail[]> {
  const result = await getPool().query<{
    journey_id: string;
    week_key: string;
    template: string;
    status: "sending" | "sent" | "failed";
    sent_at: Date | null;
    updated_at: Date;
    error: string | null;
    provider_message_id: string | null;
    delivered_at: Date | null;
    opened_at: Date | null;
    bounced_at: Date | null;
  }>(WEEKLY_FOR_ACCOUNT_SQL, [accountId]);
  return result.rows.map((row) => ({
    journeyId: String(row.journey_id),
    weekKey: row.week_key,
    template: row.template,
    status: row.status,
    at: new Date(row.sent_at ?? row.updated_at).toISOString(),
    error: row.error,
    providerMessageId: row.provider_message_id,
    deliveredAt: isoOrNull(row.delivered_at),
    openedAt: isoOrNull(row.opened_at),
    bouncedAt: isoOrNull(row.bounced_at),
  }));
}

function isoOrNull(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function listRecentProductMails(limit = 40): Promise<RecentProductMail[]> {
  const result = await getPool().query<{
    kind: "help" | "weekly";
    account_id: string;
    display_name: string | null;
    account_state: string;
    detail: string;
    status: "sending" | "sent" | "failed";
    at: Date;
    journey_id: string | null;
    provider_message_id: string | null;
    delivered_at: Date | null;
    opened_at: Date | null;
    bounced_at: Date | null;
  }>(
    `SELECT kind, account_id, display_name, account_state, detail, status, at, journey_id,
            provider_message_id, delivered_at, opened_at, bounced_at
     FROM (
       SELECT
         'help'::text AS kind,
         h.account_id,
         u.display_name,
         u.account_state::text AS account_state,
         h.type AS detail,
         'sent'::text AS status,
         h.sent_at AS at,
         NULL::uuid AS journey_id,
         h.provider_message_id,
         h.delivered_at,
         h.opened_at,
         h.bounced_at
       FROM account_help_emails h
       JOIN users u ON u.id = h.account_id
       UNION ALL
       SELECT
         'weekly'::text,
         w.account_id,
         u.display_name,
         u.account_state::text,
         w.week_key,
         w.status,
         COALESCE(w.sent_at, w.updated_at),
         w.journey_id,
         w.provider_message_id,
         w.delivered_at,
         w.opened_at,
         w.bounced_at
       FROM journey_weekly_emails w
       JOIN users u ON u.id = w.account_id
     ) mails
     ORDER BY at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    kind: row.kind,
    accountId: String(row.account_id),
    displayName: row.account_state === "deleted" ? null : row.display_name,
    accountState: row.account_state,
    detail: row.detail,
    status: row.status,
    at: new Date(row.at).toISOString(),
    journeyId: row.journey_id ? String(row.journey_id) : null,
    providerMessageId: row.provider_message_id,
    deliveredAt: isoOrNull(row.delivered_at),
    openedAt: isoOrNull(row.opened_at),
    bouncedAt: isoOrNull(row.bounced_at),
  }));
}
