import { getPool } from "../db/pool.js";

const STAMPS = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.bounced": "bounced_at",
} as const;

type StampColumn = (typeof STAMPS)[keyof typeof STAMPS];

export interface MailReceipt {
  providerMessageId: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
}

export function deliveryWord(receipt: MailReceipt): "—" | "Levererad" | "Studsade" | "Nej" {
  if (!receipt.providerMessageId) return "—";
  if (receipt.deliveredAt) return "Levererad";
  if (receipt.bouncedAt) return "Studsade";
  return "Nej";
}

export function openedWord(receipt: MailReceipt): "—" | "Öppnad" | "Nej" {
  if (!receipt.providerMessageId) return "—";
  return receipt.openedAt ? "Öppnad" : "Nej";
}

function stampColumn(eventType: string): StampColumn | null {
  if (eventType === "email.delivered") return STAMPS["email.delivered"];
  if (eventType === "email.opened") return STAMPS["email.opened"];
  if (eventType === "email.bounced") return STAMPS["email.bounced"];
  return null;
}

function stampAt(value: string | null | undefined): string {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * First delivery, open or bounce wins. Later webhooks for the same message
 * do not move the time. Unknown message ids match no row.
 */
export async function stampMailReceipt(options: {
  emailId: string;
  eventType: string;
  at?: string | null;
}): Promise<void> {
  const column = stampColumn(options.eventType);
  const emailId = options.emailId.trim();
  if (!column || !emailId) return;
  const at = stampAt(options.at);
  const sql = `UPDATE ${"account_help_emails"}
       SET ${column} = COALESCE(${column}, $2::timestamptz)
       WHERE provider_message_id = $1`;
  const weekly = `UPDATE ${"journey_weekly_emails"}
       SET ${column} = COALESCE(${column}, $2::timestamptz)
       WHERE provider_message_id = $1`;
  await getPool().query(sql, [emailId, at]);
  await getPool().query(weekly, [emailId, at]);
}
