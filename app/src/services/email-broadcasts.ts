import type pg from "pg";
import { AppError, NotFoundError } from "../errors.js";
import { getPool } from "../db/pool.js";
import { getMailer } from "./email.js";
import {
  isUsableEmail,
  MARKETING_PREVIEW_TOKEN,
  marketingListUnsubscribeHeaders,
  marketingUnsubscribeUrl,
  renderBroadcastEmail,
  type BroadcastKind,
} from "./marketing-email.js";
import { issueUnsubscribeToken } from "./marketing-preferences.js";

export type { BroadcastKind };
export type BroadcastStatus = "draft" | "sent";

export interface BroadcastDraftInput {
  kind: BroadcastKind;
  subject: string;
  heading: string;
  body: string;
}

export interface EmailBroadcast {
  id: string;
  kind: BroadcastKind;
  subject: string;
  heading: string;
  body: string;
  status: BroadcastStatus;
  recipientCount: number | null;
  createdAt: string;
  sentAt: string | null;
  createdByAdminId: string | null;
  createdByAdminEmail: string | null;
}

export interface BroadcastRecipient {
  userId: string;
  email: string;
}

const BROADCAST_SELECT = `SELECT b.id, b.kind, b.subject, b.heading, b.body, b.status,
            b.recipient_count, b.created_at, b.sent_at, b.created_by_admin_id,
            a.email AS created_by_admin_email
     FROM email_broadcasts b
     LEFT JOIN admin_users a ON a.id = b.created_by_admin_id`;

export function parseBroadcastDraft(input: {
  kind?: string;
  subject?: string;
  heading?: string;
  body?: string;
}): BroadcastDraftInput {
  if (input.kind !== "marketing" && input.kind !== "service") {
    throw new AppError("Välj typ av utskick", 400, "invalid_kind");
  }
  const subject = (input.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  const heading = (input.heading ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject) throw new AppError("Ange ett ämne", 400, "invalid_subject");
  if (subject.length > 200) throw new AppError("Ämnet får vara högst 200 tecken", 400, "invalid_subject");
  if (!heading) throw new AppError("Ange en rubrik", 400, "invalid_heading");
  if (heading.length > 200) {
    throw new AppError("Rubriken får vara högst 200 tecken", 400, "invalid_heading");
  }
  if (!body) throw new AppError("Ange en brödtext", 400, "invalid_body");
  if (body.length > 20000) {
    throw new AppError("Brödtexten får vara högst 20 000 tecken", 400, "invalid_body");
  }
  return { kind: input.kind, subject, heading, body };
}

function mapBroadcast(row: Record<string, unknown>): EmailBroadcast {
  return {
    id: String(row.id),
    kind: row.kind === "service" ? "service" : "marketing",
    subject: String(row.subject),
    heading: String(row.heading),
    body: String(row.body),
    status: row.status === "sent" ? "sent" : "draft",
    recipientCount: row.recipient_count == null ? null : Number(row.recipient_count),
    createdAt: new Date(String(row.created_at)).toISOString(),
    sentAt: row.sent_at == null ? null : new Date(String(row.sent_at)).toISOString(),
    createdByAdminId: row.created_by_admin_id == null ? null : String(row.created_by_admin_id),
    createdByAdminEmail:
      row.created_by_admin_email == null ? null : String(row.created_by_admin_email),
  };
}

function chooseEmail(contact: unknown, identity: unknown): string | null {
  const contactEmail = contact == null ? "" : String(contact);
  const identityEmail = identity == null ? "" : String(identity);
  if (isUsableEmail(contactEmail)) return contactEmail.trim();
  if (isUsableEmail(identityEmail)) return identityEmail.trim();
  return null;
}

export async function listBroadcastRecipients(
  kind: BroadcastKind,
  userId?: string,
): Promise<BroadcastRecipient[]> {
  const result = await getPool().query(
    `SELECT u.id,
            NULLIF(btrim(u.contact_email), '') AS contact_email,
            (
              SELECT NULLIF(btrim(a.email), '')
              FROM auth_identities a
              WHERE a.user_id = u.id
                AND a.email IS NOT NULL
                AND btrim(a.email) <> ''
              ORDER BY a.created_at, a.id
              LIMIT 1
            ) AS identity_email
     FROM users u
     WHERE u.account_state <> 'deleted'
       AND ($1::uuid IS NULL OR u.id = $1)
       AND ($2::boolean = false OR u.marketing_email_opt_in = true)
     ORDER BY u.created_at, u.id`,
    [userId ?? null, kind === "marketing"],
  );
  const recipients: BroadcastRecipient[] = [];
  for (const row of result.rows) {
    const email = chooseEmail(row.contact_email, row.identity_email);
    if (!email) continue;
    recipients.push({ userId: String(row.id), email });
  }
  return recipients;
}

export async function countBroadcastRecipients(kind: BroadcastKind): Promise<number> {
  return (await listBroadcastRecipients(kind)).length;
}

export function previewBroadcast(input: BroadcastDraftInput): { subject: string; text: string } {
  const unsubscribeUrl =
    input.kind === "marketing" ? marketingUnsubscribeUrl(MARKETING_PREVIEW_TOKEN) : null;
  return {
    subject: input.subject,
    text: renderBroadcastEmail({
      kind: input.kind,
      heading: input.heading,
      body: input.body,
      unsubscribeUrl,
      test: false,
    }),
  };
}

export async function listEmailBroadcasts(): Promise<EmailBroadcast[]> {
  const result = await getPool().query(
    `${BROADCAST_SELECT} ORDER BY b.created_at DESC, b.id DESC`,
  );
  return result.rows.map((row) => mapBroadcast(row as Record<string, unknown>));
}

export async function getEmailBroadcast(id: string): Promise<EmailBroadcast | null> {
  const result = await getPool().query(`${BROADCAST_SELECT} WHERE b.id = $1`, [id]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapBroadcast(row) : null;
}

export async function createEmailBroadcast(
  input: BroadcastDraftInput,
  adminUserId: string,
  client?: pg.Pool | pg.PoolClient,
): Promise<EmailBroadcast> {
  const db = client ?? getPool();
  const result = await db.query(
    `INSERT INTO email_broadcasts (kind, subject, heading, body, created_by_admin_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.kind, input.subject, input.heading, input.body, adminUserId],
  );
  const created = await getEmailBroadcast(String(result.rows[0].id));
  if (!created) throw new NotFoundError("Utskicket hittades inte");
  return created;
}

export async function updateEmailBroadcastDraft(
  id: string,
  input: BroadcastDraftInput,
): Promise<EmailBroadcast> {
  const result = await getPool().query(
    `UPDATE email_broadcasts
     SET kind = $2, subject = $3, heading = $4, body = $5
     WHERE id = $1 AND status = 'draft'
     RETURNING id`,
    [id, input.kind, input.subject, input.heading, input.body],
  );
  if ((result.rowCount ?? 0) === 0) {
    const existing = await getEmailBroadcast(id);
    if (!existing) throw new NotFoundError("Utskicket hittades inte");
    throw new AppError("Ett skickat utskick kan inte ändras", 409, "already_sent");
  }
  const updated = await getEmailBroadcast(id);
  if (!updated) throw new NotFoundError("Utskicket hittades inte");
  return updated;
}

export async function sendTestBroadcast(
  input: BroadcastDraftInput,
  adminEmail: string,
): Promise<void> {
  const unsubscribeUrl =
    input.kind === "marketing" ? marketingUnsubscribeUrl(MARKETING_PREVIEW_TOKEN) : null;
  await getMailer().send({
    to: adminEmail,
    subject: `[Test] ${input.subject}`,
    text: renderBroadcastEmail({
      kind: input.kind,
      heading: input.heading,
      body: input.body,
      unsubscribeUrl,
      test: true,
    }),
    ...(unsubscribeUrl ? { headers: marketingListUnsubscribeHeaders(unsubscribeUrl) } : {}),
  });
}

export async function sendEmailBroadcast(
  broadcastId: string,
): Promise<{ recipientCount: number }> {
  const broadcast = await getEmailBroadcast(broadcastId);
  if (!broadcast) throw new NotFoundError("Utskicket hittades inte");
  if (broadcast.status !== "draft") {
    throw new AppError("Utskicket är redan skickat", 409, "already_sent");
  }

  const snapshot = await listBroadcastRecipients(broadcast.kind);
  if (snapshot.length === 0) {
    throw new AppError("Det finns inga mottagare.", 400, "no_recipients");
  }

  const mailer = getMailer();
  let sent = 0;
  for (const recipient of snapshot) {
    const fresh = await listBroadcastRecipients(broadcast.kind, recipient.userId);
    const current = fresh[0];
    if (!current) continue;
    const unsubscribeUrl =
      broadcast.kind === "marketing"
        ? marketingUnsubscribeUrl(await issueUnsubscribeToken(current.userId))
        : null;
    try {
      await mailer.send({
        to: current.email,
        subject: broadcast.subject,
        text: renderBroadcastEmail({
          kind: broadcast.kind,
          heading: broadcast.heading,
          body: broadcast.body,
          unsubscribeUrl,
          test: false,
        }),
        ...(unsubscribeUrl ? { headers: marketingListUnsubscribeHeaders(unsubscribeUrl) } : {}),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Kunde inte skicka";
      throw new AppError(
        sent > 0
          ? `Utskicket avbröts efter ${sent} mejl och är kvar som utkast. ${reason}`
          : "Kunde inte skicka mejlet.",
        502,
        "email_send_failed",
      );
    }
    sent += 1;
  }

  const updated = await getPool().query(
    `UPDATE email_broadcasts
     SET status = 'sent', sent_at = now(), recipient_count = $2
     WHERE id = $1 AND status = 'draft'`,
    [broadcastId, sent],
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new AppError("Utskicket är redan skickat", 409, "already_sent");
  }
  return { recipientCount: sent };
}
