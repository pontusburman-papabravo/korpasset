import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { EmailSendError, getMailer } from "./email.js";
import { buildWeeklySummaryEmail } from "./weekly-summary-email.js";
import { personalShareUrl } from "./share.js";
import {
  getJourneyWeeklySummary,
  isWeeklySummarySendWindow,
  previousStockholmWeek,
  stockholmWeekContaining,
  weekHasRelevantActivity,
  type JourneyWeeklySummary,
  type StockholmWeek,
} from "./weekly-summary.js";

/**
 * Sunday product mail for the student on an active driving journey.
 *
 * Category: product communication about the student's own journey, the same
 * class as the early help emails in account_help_emails. It is not a
 * waitlist mail and not a newsletter.
 *
 * Preferences: product accounts have no unsubscribe, newsletter or email
 * consent model. Cookie consent only covers website analytics. Help email
 * goes to the contact address, otherwise the sign-in address, and never to
 * a deleted account. This mail follows that address rule. It also skips
 * suspended accounts, because a weekly summary should not go to an
 * inactivated account. No parallel preference is stored.
 *
 * When: Sundays from 18:00 Europe/Stockholm until Monday 00:00. If Sunday
 * is missed, the week is not sent later. The summary covers Monday 00:00
 * inclusive through the next Monday 00:00 exclusive. Activity after the
 * send still belongs to this calendar week, but a second mail is not sent.
 *
 * Who: the student on a journey with status active, account_state guest or
 * active, with a contact or sign-in email, and with at least one completed
 * drive, training observation or checkoff in the week. Supervisors are not
 * recipients in this version. Admin logins live in admin_users and are not
 * product accounts. There is no separate test-account flag.
 *
 * Idempotency: one row per (journey_id, ISO week, template). The row is
 * claimed before the provider is called. status sent is never claimed
 * again. status failed can be retried. status sending is left alone, so a
 * crash after the provider accepted the mail cannot produce a second copy.
 * One recipient's failure does not stop the batch.
 */

export const WEEKLY_SUMMARY_TEMPLATE = "weekly_summary";
const WEEKLY_SUMMARY_LOCK_KEY = 180_025;

export type WeeklyMailSkipReason =
  | "no_activity"
  | "missing_email"
  | "inactive_account"
  | "inactive_journey"
  | "already_sent"
  | "in_progress";

export interface WeeklyMailLogger {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

export interface WeeklyMailDecision {
  action: "sent" | "failed" | "skipped";
  accountId: string;
  journeyId: string;
  weekKey: string;
  template: typeof WEEKLY_SUMMARY_TEMPLATE;
  reason?: WeeklyMailSkipReason;
  sentAt?: string;
  providerMessageId?: string | null;
}

export interface WeeklyMailRunSummary {
  skippedWindow: boolean;
  skippedLock: boolean;
  weekKey: string | null;
  decisions: WeeklyMailDecision[];
}

export interface JourneyWeeklyEmailRecord {
  weekKey: string;
  template: string;
  status: "sending" | "sent" | "failed";
  sentAt: string | null;
  providerMessageId: string | null;
}

interface CandidateRow {
  journey_id: string;
  account_id: string;
  account_state: string;
  journey_status: string;
  display_name: string | null;
  email: string | null;
}

const noopLog: WeeklyMailLogger = {
  info() {},
  error() {},
};

const CANDIDATE_SQL = `
  SELECT
    j.id AS journey_id,
    u.id AS account_id,
    u.account_state::text AS account_state,
    j.status::text AS journey_status,
    u.display_name,
    COALESCE(NULLIF(btrim(u.contact_email), ''), identity.email) AS email
  FROM driving_journeys j
  JOIN users u ON u.id = j.student_user_id
  LEFT JOIN LATERAL (
    SELECT NULLIF(btrim(a.email), '') AS email
    FROM auth_identities a
    WHERE a.user_id = u.id
      AND NULLIF(btrim(a.email), '') IS NOT NULL
    ORDER BY a.verified_at DESC NULLS LAST, a.created_at DESC
    LIMIT 1
  ) identity ON true
`;

function appUrl(): string {
  return `${config.appBaseUrl.replace(/\/$/, "")}/app`;
}

function sendErrorCode(error: unknown): string {
  if (error instanceof EmailSendError) return error.message.slice(0, 200);
  return "email_send_failed";
}

function providerId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const id = (result as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function loadCandidates(): Promise<CandidateRow[]> {
  const result = await getPool().query<CandidateRow>(
    `${CANDIDATE_SQL}
     WHERE j.status = 'active'
       AND u.account_state IN ('guest', 'active')
     ORDER BY j.id`,
  );
  return result.rows;
}

async function loadCandidate(journeyId: string): Promise<CandidateRow | null> {
  const result = await getPool().query<CandidateRow>(`${CANDIDATE_SQL} WHERE j.id = $1`, [
    journeyId,
  ]);
  return result.rows[0] ?? null;
}

function eligibility(row: CandidateRow): WeeklyMailSkipReason | null {
  if (row.account_state !== "guest" && row.account_state !== "active") return "inactive_account";
  if (row.journey_status !== "active") return "inactive_journey";
  if (!row.email?.trim()) return "missing_email";
  return null;
}

async function claim(
  row: CandidateRow,
  weekKey: string,
): Promise<"claimed" | "already_sent" | "in_progress"> {
  const inserted = await getPool().query<{ status: string }>(
    `INSERT INTO journey_weekly_emails (journey_id, account_id, week_key, template, status)
     VALUES ($1, $2, $3, $4, 'sending')
     ON CONFLICT (journey_id, week_key, template) DO UPDATE
       SET status = 'sending',
           account_id = EXCLUDED.account_id,
           error = NULL,
           updated_at = now()
       WHERE journey_weekly_emails.status = 'failed'
     RETURNING status`,
    [row.journey_id, row.account_id, weekKey, WEEKLY_SUMMARY_TEMPLATE],
  );
  if (inserted.rowCount) return "claimed";
  const existing = await getPool().query<{ status: string }>(
    `SELECT status FROM journey_weekly_emails
     WHERE journey_id = $1 AND week_key = $2 AND template = $3`,
    [row.journey_id, weekKey, WEEKLY_SUMMARY_TEMPLATE],
  );
  return existing.rows[0]?.status === "sent" ? "already_sent" : "in_progress";
}

async function markSent(
  journeyId: string,
  weekKey: string,
  providerMessageId: string | null,
): Promise<string> {
  const result = await getPool().query<{ sent_at: Date }>(
    `UPDATE journey_weekly_emails
     SET status = 'sent',
         sent_at = now(),
         provider_message_id = $4,
         error = NULL,
         updated_at = now()
     WHERE journey_id = $1 AND week_key = $2 AND template = $3
     RETURNING sent_at`,
    [journeyId, weekKey, WEEKLY_SUMMARY_TEMPLATE, providerMessageId],
  );
  return new Date(result.rows[0].sent_at).toISOString();
}

async function markFailed(journeyId: string, weekKey: string, error: string): Promise<void> {
  await getPool().query(
    `UPDATE journey_weekly_emails
     SET status = 'failed', error = $4, updated_at = now()
     WHERE journey_id = $1 AND week_key = $2 AND template = $3
       AND status <> 'sent'`,
    [journeyId, weekKey, WEEKLY_SUMMARY_TEMPLATE, error],
  );
}

function logDecision(log: WeeklyMailLogger, decision: WeeklyMailDecision): void {
  log.info(
    {
      weekKey: decision.weekKey,
      accountId: decision.accountId,
      journeyId: decision.journeyId,
      template: decision.template,
      status: decision.action,
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.sentAt ? { sentAt: decision.sentAt } : {}),
      ...(decision.providerMessageId ? { providerMessageId: decision.providerMessageId } : {}),
    },
    "weekly summary decision",
  );
}

async function deliverOne(
  row: CandidateRow,
  week: StockholmWeek,
  log: WeeklyMailLogger,
): Promise<WeeklyMailDecision> {
  const base = {
    accountId: row.account_id,
    journeyId: row.journey_id,
    weekKey: week.weekKey,
    template: WEEKLY_SUMMARY_TEMPLATE,
  } as const;
  const blocked = eligibility(row);
  if (blocked) {
    const skipped: WeeklyMailDecision = { ...base, action: "skipped", reason: blocked };
    logDecision(log, skipped);
    return skipped;
  }

  const summary = await getJourneyWeeklySummary(row.journey_id, week);
  if (!summary || !weekHasRelevantActivity(summary)) {
    const skipped: WeeklyMailDecision = { ...base, action: "skipped", reason: "no_activity" };
    logDecision(log, skipped);
    return skipped;
  }

  const claimed = await claim(row, week.weekKey);
  if (claimed !== "claimed") {
    const skipped: WeeklyMailDecision = {
      ...base,
      action: "skipped",
      reason: claimed === "already_sent" ? "already_sent" : "in_progress",
    };
    logDecision(log, skipped);
    return skipped;
  }

  let previous: JourneyWeeklySummary | null = null;
  try {
    previous = await getJourneyWeeklySummary(row.journey_id, await previousStockholmWeek(week));
  } catch (error) {
    log.error(
      { err: error, accountId: row.account_id, journeyId: row.journey_id, weekKey: week.weekKey },
      "weekly summary previous week failed",
    );
  }

  try {
    const message = buildWeeklySummaryEmail({
      displayName: row.display_name,
      summary,
      previous,
      appUrl: appUrl(),
      shareUrl: await personalShareUrl(row.account_id, "weekly_email"),
    });
    const result = await getMailer().send({
      to: row.email!.trim(),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const messageId = providerId(result);
    try {
      const sentAt = await markSent(row.journey_id, week.weekKey, messageId);
      const sent: WeeklyMailDecision = {
        ...base,
        action: "sent",
        sentAt,
        providerMessageId: messageId,
      };
      logDecision(log, sent);
      return sent;
    } catch (error) {
      log.error(
        {
          err: error,
          accountId: row.account_id,
          journeyId: row.journey_id,
          weekKey: week.weekKey,
          providerMessageId: messageId,
        },
        "weekly summary status update failed after send",
      );
      const sent: WeeklyMailDecision = {
        ...base,
        action: "sent",
        providerMessageId: messageId,
      };
      logDecision(log, sent);
      return sent;
    }
  } catch (error) {
    const code = sendErrorCode(error);
    try {
      await markFailed(row.journey_id, week.weekKey, code);
    } catch (updateError) {
      log.error(
        { err: updateError, accountId: row.account_id, journeyId: row.journey_id, weekKey: week.weekKey },
        "weekly summary failure status update failed",
      );
    }
    log.error(
      {
        err: error,
        accountId: row.account_id,
        journeyId: row.journey_id,
        weekKey: week.weekKey,
        template: WEEKLY_SUMMARY_TEMPLATE,
        status: "failed",
        error: code,
      },
      "weekly summary send failed",
    );
    return { ...base, action: "failed", reason: undefined };
  }
}

export async function sendWeeklySummaryEmails(options?: {
  now?: Date;
  log?: WeeklyMailLogger;
}): Promise<WeeklyMailRunSummary> {
  const now = options?.now ?? new Date();
  const log = options?.log ?? noopLog;
  const week = await stockholmWeekContaining(now);
  if (!isWeeklySummarySendWindow(week.dow, week.hour)) {
    return { skippedWindow: true, skippedLock: false, weekKey: week.weekKey, decisions: [] };
  }

  const client = await getPool().connect();
  try {
    const locked = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock($1) AS ok`, [
      WEEKLY_SUMMARY_LOCK_KEY,
    ]);
    if (!locked.rows[0]?.ok) {
      return { skippedWindow: false, skippedLock: true, weekKey: week.weekKey, decisions: [] };
    }
    try {
      const decisions: WeeklyMailDecision[] = [];
      const candidates = await loadCandidates();
      for (const candidate of candidates) {
        try {
          const fresh = await loadCandidate(candidate.journey_id);
          const row = fresh ?? {
            ...candidate,
            account_state: "deleted",
            journey_status: "archived",
            email: null,
          };
          decisions.push(await deliverOne(row, week, log));
        } catch (error) {
          log.error(
            { err: error, accountId: candidate.account_id, journeyId: candidate.journey_id, weekKey: week.weekKey },
            "weekly summary recipient failed",
          );
          decisions.push({
            action: "failed",
            accountId: candidate.account_id,
            journeyId: candidate.journey_id,
            weekKey: week.weekKey,
            template: WEEKLY_SUMMARY_TEMPLATE,
          });
        }
      }
      return { skippedWindow: false, skippedLock: false, weekKey: week.weekKey, decisions };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [WEEKLY_SUMMARY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export async function latestJourneyWeeklyEmail(
  journeyId: string,
): Promise<JourneyWeeklyEmailRecord | null> {
  const result = await getPool().query<{
    week_key: string;
    template: string;
    status: "sending" | "sent" | "failed";
    sent_at: Date | null;
    provider_message_id: string | null;
  }>(
    `SELECT week_key, template, status, sent_at, provider_message_id
     FROM journey_weekly_emails
     WHERE journey_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [journeyId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    weekKey: row.week_key,
    template: row.template,
    status: row.status,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    providerMessageId: row.provider_message_id,
  };
}
