import { getPool } from "../db/pool.js";
import {
  sendNoConnectedSupervisorHelpEmail,
  sendNoJourneyHelpEmail,
} from "./email.js";

/** Quiet period after the account's last activity before a help email may go out. */
export const HELP_EMAIL_QUIET_MS = 24 * 60 * 60 * 1000;

/** Separate from the waitlist retention lock. */
const HELP_EMAIL_LOCK_KEY = 180_024;

export const HELP_EMAIL_TYPES = ["no_journey", "no_connected_supervisor"] as const;
export type HelpEmailType = (typeof HELP_EMAIL_TYPES)[number];

export const HELP_EMAIL_SKIP_REASONS = [
  "recent_activity",
  "stop_resolved",
  "already_sent",
  "missing_email",
  "not_eligible_stop",
] as const;
export type HelpEmailSkipReason = (typeof HELP_EMAIL_SKIP_REASONS)[number];

export interface HelpEmailLogger {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

export interface HelpEmailSentRecord {
  type: HelpEmailType;
  sentAt: string;
}

export interface AccountHelpEmailState {
  accountId: string;
  lastActivityAt: string;
  stop: HelpEmailType | null;
  sent: HelpEmailSentRecord[];
}

interface HelpEmailDecisionSent {
  action: "sent";
  accountId: string;
  helpEmailType: HelpEmailType;
  sentAt: string;
}

interface HelpEmailDecisionSkipped {
  action: "skipped";
  accountId: string;
  helpEmailType: HelpEmailType | null;
  reason: HelpEmailSkipReason;
}

export type HelpEmailDecision = HelpEmailDecisionSent | HelpEmailDecisionSkipped;

export interface HelpEmailRunSummary {
  skippedLock: boolean;
  decisions: HelpEmailDecision[];
}

interface AccountRow {
  id: string;
  account_state: string;
  last_activity_at: Date | string;
  email: string | null;
  unsupervised_journey: boolean;
  owns_journey: boolean;
  active_supervisor: boolean;
  sent: unknown;
}

const noopLog: HelpEmailLogger = {
  info() {},
  error() {},
};

/**
 * Same account clock as admin uses for konton utan resa:
 * last app open (`users.last_seen_at`), otherwise when the account was created.
 * Journey creation, drive times and another person's activity do not move it.
 */
const ACCOUNT_SQL = `
  SELECT
    u.id,
    u.account_state,
    COALESCE(u.last_seen_at, u.created_at) AS last_activity_at,
    COALESCE(NULLIF(btrim(u.contact_email), ''), identity.email) AS email,
    EXISTS (
      SELECT 1
      FROM driving_journeys j
      WHERE j.student_user_id = u.id
        AND j.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM journey_collaborators c
          WHERE c.journey_id = j.id
            AND c.role = 'supervisor'
            AND c.status = 'active'
        )
    ) AS unsupervised_journey,
    EXISTS (
      SELECT 1 FROM driving_journeys j WHERE j.student_user_id = u.id
    ) AS owns_journey,
    EXISTS (
      SELECT 1
      FROM journey_collaborators c
      WHERE c.user_id = u.id
        AND c.role = 'supervisor'
        AND c.status = 'active'
    ) AS active_supervisor,
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('type', h.type, 'sentAt', h.sent_at)
          ORDER BY h.sent_at
        ),
        '[]'::jsonb
      )
      FROM account_help_emails h
      WHERE h.account_id = u.id
    ) AS sent
  FROM users u
  LEFT JOIN LATERAL (
    SELECT NULLIF(btrim(a.email), '') AS email
    FROM auth_identities a
    WHERE a.user_id = u.id
      AND NULLIF(btrim(a.email), '') IS NOT NULL
    ORDER BY a.verified_at DESC NULLS LAST, a.created_at DESC
    LIMIT 1
  ) identity ON true
`;

function isHelpEmailType(value: unknown): value is HelpEmailType {
  return value === "no_journey" || value === "no_connected_supervisor";
}

function sentRecords(value: unknown): HelpEmailSentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const type = (item as { type?: unknown }).type;
    const sentAt = (item as { sentAt?: unknown }).sentAt;
    if (!isHelpEmailType(type) || (typeof sentAt !== "string" && !(sentAt instanceof Date))) {
      return [];
    }
    return [{ type, sentAt: new Date(sentAt).toISOString() }];
  });
}

/**
 * Early onboarding only.
 * An active journey with no active supervisor is "no connected supervisor".
 * No owned journey and no active supervisor membership is "no journey".
 * A connected supervisor, or a journey that already has one, is not an early stop.
 * Names and other accounts are never consulted.
 */
export function helpEmailStop(row: {
  account_state: string;
  unsupervised_journey: boolean;
  owns_journey: boolean;
  active_supervisor: boolean;
}): HelpEmailType | null {
  if (row.account_state === "deleted") return null;
  if (row.unsupervised_journey) return "no_connected_supervisor";
  if (!row.owns_journey && !row.active_supervisor) return "no_journey";
  return null;
}

function decide(row: AccountRow, now: Date): {
  stop: HelpEmailType | null;
  lastActivityAt: Date;
  email: string | null;
  sent: HelpEmailSentRecord[];
  action: "send" | "skip";
  reason?: HelpEmailSkipReason;
} {
  const stop = helpEmailStop(row);
  const lastActivityAt = new Date(row.last_activity_at);
  const sent = sentRecords(row.sent);
  const email = typeof row.email === "string" && row.email.trim() ? row.email.trim() : null;
  if (!stop) {
    return { stop, lastActivityAt, email, sent, action: "skip", reason: "not_eligible_stop" };
  }
  if (sent.some((item) => item.type === stop)) {
    return { stop, lastActivityAt, email, sent, action: "skip", reason: "already_sent" };
  }
  if (lastActivityAt.getTime() > now.getTime() - HELP_EMAIL_QUIET_MS) {
    return { stop, lastActivityAt, email, sent, action: "skip", reason: "recent_activity" };
  }
  if (!email) {
    return { stop, lastActivityAt, email, sent, action: "skip", reason: "missing_email" };
  }
  return { stop, lastActivityAt, email, sent, action: "send" };
}

async function loadAccount(accountId: string): Promise<AccountRow | null> {
  const result = await getPool().query<AccountRow>(`${ACCOUNT_SQL} WHERE u.id = $1`, [accountId]);
  return result.rows[0] ?? null;
}

async function loadEarlyStopAccounts(): Promise<AccountRow[]> {
  const result = await getPool().query<AccountRow>(
    `${ACCOUNT_SQL}
     WHERE u.account_state <> 'deleted'
       AND (
         EXISTS (
           SELECT 1
           FROM driving_journeys j
           WHERE j.student_user_id = u.id
             AND j.status = 'active'
             AND NOT EXISTS (
               SELECT 1
               FROM journey_collaborators c
               WHERE c.journey_id = j.id
                 AND c.role = 'supervisor'
                 AND c.status = 'active'
             )
         )
         OR (
           NOT EXISTS (SELECT 1 FROM driving_journeys j WHERE j.student_user_id = u.id)
           AND NOT EXISTS (
             SELECT 1
             FROM journey_collaborators c
             WHERE c.user_id = u.id
               AND c.role = 'supervisor'
               AND c.status = 'active'
           )
         )
       )
     ORDER BY u.id`,
  );
  return result.rows;
}

export async function getAccountHelpEmailState(
  accountId: string,
): Promise<AccountHelpEmailState | null> {
  const row = await loadAccount(accountId);
  if (!row) return null;
  return {
    accountId: row.id,
    lastActivityAt: new Date(row.last_activity_at).toISOString(),
    stop: helpEmailStop(row),
    sent: sentRecords(row.sent),
  };
}

function logDecision(log: HelpEmailLogger, decision: HelpEmailDecision): void {
  log.info(
    {
      accountId: decision.accountId,
      helpEmailType: decision.helpEmailType,
      decision: decision.action,
      ...(decision.action === "skipped" ? { reason: decision.reason } : {}),
      ...(decision.action === "sent" ? { sentAt: decision.sentAt } : {}),
    },
    "help email decision",
  );
}

async function deliver(
  accountId: string,
  type: HelpEmailType,
  email: string,
): Promise<string> {
  if (type === "no_journey") await sendNoJourneyHelpEmail(email);
  else await sendNoConnectedSupervisorHelpEmail(email);
  const inserted = await getPool().query<{ sent_at: Date }>(
    `INSERT INTO account_help_emails (account_id, type)
     VALUES ($1, $2)
     ON CONFLICT (account_id, type) DO NOTHING
     RETURNING sent_at`,
    [accountId, type],
  );
  const sentAt = inserted.rows[0]?.sent_at;
  if (!sentAt) {
    const existing = await getPool().query<{ sent_at: Date }>(
      `SELECT sent_at FROM account_help_emails WHERE account_id = $1 AND type = $2`,
      [accountId, type],
    );
    return new Date(existing.rows[0].sent_at).toISOString();
  }
  return new Date(sentAt).toISOString();
}

/**
 * Find accounts on the two early stops, re-check each one immediately before
 * sending, and record the email only after the provider accepts it.
 * Safe to run repeatedly. One process at a time.
 */
export async function sendStuckHelpEmails(options?: {
  now?: Date;
  log?: HelpEmailLogger;
  beforeSend?: (accountId: string, type: HelpEmailType) => Promise<void>;
}): Promise<HelpEmailRunSummary> {
  const now = options?.now ?? new Date();
  const log = options?.log ?? noopLog;
  const client = await getPool().connect();
  try {
    const locked = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      [HELP_EMAIL_LOCK_KEY],
    );
    if (!locked.rows[0]?.ok) {
      return { skippedLock: true, decisions: [] };
    }
    try {
      const decisions: HelpEmailDecision[] = [];
      const candidates = await loadEarlyStopAccounts();
      for (const candidate of candidates) {
        let current = decide(candidate, now);
        if (current.action === "send" && current.stop && options?.beforeSend) {
          await options.beforeSend(candidate.id, current.stop);
          const fresh = await loadAccount(candidate.id);
          current = fresh
            ? decide(fresh, now)
            : {
                stop: null,
                lastActivityAt: current.lastActivityAt,
                email: null,
                sent: current.sent,
                action: "skip",
                reason: "not_eligible_stop",
              };
          if (current.action === "skip" && current.reason === "not_eligible_stop") {
            current = { ...current, reason: "stop_resolved" };
          }
        } else if (current.action === "send" && current.stop) {
          const fresh = await loadAccount(candidate.id);
          current = fresh
            ? decide(fresh, now)
            : { ...current, action: "skip", reason: "stop_resolved", stop: null, email: null };
          if (current.action === "skip" && current.reason === "not_eligible_stop") {
            current = { ...current, reason: "stop_resolved" };
          }
        }

        if (current.action === "skip") {
          const skipped: HelpEmailDecisionSkipped = {
            action: "skipped",
            accountId: candidate.id,
            helpEmailType: current.stop,
            reason: current.reason ?? "not_eligible_stop",
          };
          decisions.push(skipped);
          logDecision(log, skipped);
          continue;
        }

        try {
          const sentAt = await deliver(candidate.id, current.stop!, current.email!);
          const sent: HelpEmailDecisionSent = {
            action: "sent",
            accountId: candidate.id,
            helpEmailType: current.stop!,
            sentAt,
          };
          decisions.push(sent);
          logDecision(log, sent);
        } catch (error) {
          log.error(
            { err: error, accountId: candidate.id, helpEmailType: current.stop },
            "help email send failed",
          );
        }
      }
      return { skippedLock: false, decisions };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [HELP_EMAIL_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
