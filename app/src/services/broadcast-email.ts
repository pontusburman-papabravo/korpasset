import { getPool } from "../db/pool.js";
import { getMailer, type OutboundEmail } from "./email.js";

/** Broadcasts use the public address. Other mail stays on EMAIL_FROM. */
export const BROADCAST_FROM = "Körpasset <info@korpasset.se>";

/**
 * Everyone we can reach: waitlist except declined, plus product accounts
 * that still have an address. Deleted accounts are omitted. One row per address.
 */
export async function listBroadcastRecipients(): Promise<string[]> {
  const result = await getPool().query(
    `SELECT DISTINCT email
     FROM (
       SELECT email_normalized AS email
       FROM interest_signups
       WHERE status <> 'declined'
         AND btrim(email_normalized) <> ''
       UNION
       SELECT contact_email_normalized
       FROM users
       WHERE account_state <> 'deleted'
         AND contact_email_normalized IS NOT NULL
         AND btrim(contact_email_normalized) <> ''
       UNION
       SELECT a.email_normalized
       FROM auth_identities a
       JOIN users u ON u.id = a.user_id
       WHERE u.account_state <> 'deleted'
         AND a.email_normalized IS NOT NULL
         AND btrim(a.email_normalized) <> ''
     ) recipients
     ORDER BY email`,
  );
  return result.rows.map((row) => String(row.email));
}

export async function sendBroadcast(input: {
  recipients: string[];
  subject: string;
  text: string;
  send?: (email: OutboundEmail) => Promise<void>;
}): Promise<{ sent: number; failed: string[] }> {
  const send = input.send ?? ((email) => getMailer().send(email));
  const seen = new Set<string>();
  let sent = 0;
  const failed: string[] = [];
  for (const raw of input.recipients) {
    const to = raw.trim().toLowerCase();
    if (!to || seen.has(to)) continue;
    seen.add(to);
    try {
      await send({
        to,
        from: BROADCAST_FROM,
        subject: input.subject,
        text: input.text,
      });
      sent += 1;
    } catch {
      failed.push(to);
    }
  }
  return { sent, failed };
}
