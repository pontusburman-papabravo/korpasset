import { config } from "../config.js";
import {
  formatInterestPlatforms,
  type InterestRole,
  type InterestSignup,
} from "./interest.js";

const WAITLIST_ROLE_LABELS: Record<InterestRole, string> = {
  parent: "Förälder / vårdnadshavare",
  student: "Elev",
  supervisor: "Handledare",
  other: "Annat",
};

const WAITLIST_ADMIN_INBOX = "support@korpasset.se";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export interface Mailer {
  send(email: OutboundEmail): Promise<void>;
}

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

const DEFAULT_FROM = "Körpasset <support@korpasset.se>";

function resendMailer(): Mailer {
  return {
    async send(email) {
      const apiKey = config.resendApiKey;
      if (!apiKey) {
        throw new EmailSendError("RESEND_API_KEY is not configured");
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom || DEFAULT_FROM,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
        }),
      });
      if (!response.ok) {
        throw new EmailSendError(`Resend responded ${response.status}`);
      }
    },
  };
}

let mailer: Mailer = resendMailer();

export function getMailer(): Mailer {
  return mailer;
}

export function setMailerForTests(next: Mailer | null): void {
  mailer = next ?? resendMailer();
}

export function adminResetEmailText(resetUrl: string): string {
  return [
    "Hej,",
    "",
    "Du har begärt att återställa lösenordet till Körpasset admin.",
    "",
    `Återställ lösenord: ${resetUrl}`,
    "",
    "Länken gäller i 30 minuter.",
    "",
    "Om du inte begärde detta kan du ignorera mejlet.",
    "",
    "Körpasset",
  ].join("\n");
}

export async function sendAdminResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  await getMailer().send({
    to,
    subject: "Återställ lösenordet till Körpasset",
    text: adminResetEmailText(resetUrl),
  });
}

export function waitlistConfirmEmailText(name: string): string {
  return [
    `Hej ${name},`,
    "",
    "Tack för att du skrivit upp dig på Körpassets beta.",
    "",
    "Vi tar in familjer löpande och mejlar när det är er tur. En anmälan ger inte automatisk access.",
    "",
    "Körpasset hjälper er se vad som är bra att öva på nästa gång — även om mamma, pappa och syskon turas om.",
    "",
    "Hälsningar",
    "Körpasset",
  ].join("\n");
}

export function waitlistAdminNotifyText(signup: InterestSignup): string {
  return [
    "Ny intresseanmälan till betan.",
    "",
    `Namn: ${signup.name}`,
    `E-post: ${signup.email}`,
    `Roll: ${WAITLIST_ROLE_LABELS[signup.role]}`,
    `Plattform: ${formatInterestPlatforms(signup)}`,
    `Ort: ${signup.city ?? "—"}`,
    "",
    "Meddelande:",
    signup.message?.trim() || "(inget)",
    "",
    `Admin: ${config.appBaseUrl}/admin/signups/${signup.id}`,
  ].join("\n");
}

export async function notifyWaitlistSignup(
  signup: InterestSignup,
  created: boolean,
): Promise<void> {
  if (!created || !config.resendApiKey) return;
  const mailer = getMailer();
  await mailer.send({
    to: signup.email,
    subject: "Tack — vi har tagit emot din anmälan till Körpasset",
    text: waitlistConfirmEmailText(signup.name),
  });
  await mailer.send({
    to: WAITLIST_ADMIN_INBOX,
    subject: `Beta-anmälan: ${signup.name}`,
    text: waitlistAdminNotifyText(signup),
  });
}
