import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { issueUnsubscribeToken } from "./marketing-preferences.js";

/** News, tips and offers. Separate from product and transactional mail. */
export const MARKETING_MAIL_CATEGORY = "marketing" as const;

export function marketingUnsubscribeUrl(token: string): string {
  const base = config.appBaseUrl.replace(/\/$/, "");
  return `${base}/avregistrera/${encodeURIComponent(token)}`;
}

export function marketingListUnsubscribeHeaders(
  unsubscribeUrl: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function renderMarketingEmail(input: {
  heading: string;
  body: string;
  unsubscribeUrl: string;
}): string {
  return [
    input.heading.trim(),
    "",
    input.body.trim(),
    "",
    "Du får detta eftersom du har valt att få nyheter från Körpasset.",
    "Vill du inte få fler nyheter från Körpasset? Avregistrera dig här.",
    `Avregistrera dig: ${input.unsubscribeUrl}`,
    "Körpasset · Papa Bravo AB",
  ].join("\n");
}

export interface MarketingEmailDraft {
  category: typeof MARKETING_MAIL_CATEGORY;
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

/**
 * Builds one marketing message, or returns null when it must not be sent.
 * Null covers opt-out, a missing address, and deleted or suspended accounts.
 * This function does not call the mailer.
 */
export async function prepareMarketingEmail(input: {
  userId: string;
  subject: string;
  heading: string;
  body: string;
}): Promise<MarketingEmailDraft | null> {
  const result = await getPool().query(
    `SELECT
       u.account_state::text AS account_state,
       u.marketing_email_opt_in,
       COALESCE(NULLIF(btrim(u.contact_email), ''), identity.email) AS email
     FROM users u
     LEFT JOIN LATERAL (
       SELECT NULLIF(btrim(a.email), '') AS email
       FROM auth_identities a
       WHERE a.user_id = u.id
         AND NULLIF(btrim(a.email), '') IS NOT NULL
       ORDER BY a.verified_at DESC NULLS LAST, a.created_at DESC
       LIMIT 1
     ) identity ON true
     WHERE u.id = $1`,
    [input.userId],
  );
  const row = result.rows[0] as
    | {
        account_state: string;
        marketing_email_opt_in: boolean;
        email: string | null;
      }
    | undefined;
  if (!row || row.marketing_email_opt_in !== true) return null;
  if (row.account_state !== "guest" && row.account_state !== "active") return null;
  const to = row.email?.trim() ?? "";
  if (!to) return null;

  const unsubscribeUrl = marketingUnsubscribeUrl(await issueUnsubscribeToken(input.userId));
  return {
    category: MARKETING_MAIL_CATEGORY,
    to,
    subject: input.subject.trim(),
    text: renderMarketingEmail({
      heading: input.heading,
      body: input.body,
      unsubscribeUrl,
    }),
    headers: marketingListUnsubscribeHeaders(unsubscribeUrl),
  };
}
