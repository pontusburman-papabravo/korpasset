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
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface MailSendResult {
  id: string | null;
}

export interface Mailer {
  send(email: OutboundEmail): Promise<MailSendResult | void>;
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
          ...(email.html ? { html: email.html } : {}),
          ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
          ...(email.headers ? { headers: email.headers } : {}),
        }),
      });
      if (!response.ok) {
        throw new EmailSendError(`Resend responded ${response.status}`);
      }
      let id: string | null = null;
      try {
        const payload = (await response.json()) as { id?: unknown };
        if (typeof payload.id === "string" && payload.id.trim()) id = payload.id.trim();
      } catch {
        id = null;
      }
      return { id };
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

export function noJourneyHelpEmailText(appUrl: string): string {
  return [
    "Hej,",
    "",
    "Du har ett konto i Körpasset, men starten är inte klar.",
    "",
    "Om du är elev: öppna appen och skapa din körkortsresa.",
    "Om du är handledare: öppna inbjudan från eleven och acceptera den.",
    "",
    "Behöver du hjälp att komma vidare? Svara på det här mejlet.",
    "",
    `Öppna Körpasset: ${appUrl}`,
    "",
    "Hälsningar",
    "Körpasset",
  ].join("\n");
}

export function noConnectedSupervisorHelpEmailText(appUrl: string): string {
  return [
    "Hej,",
    "",
    "Du har kommit igång med din körkortsresa, men ännu ingen ansluten handledare. Behöver du hjälp att bjuda in din handledare?",
    "",
    `Öppna Körpasset och bjud in handledaren: ${appUrl}`,
    "",
    "Hälsningar",
    "Körpasset",
  ].join("\n");
}

function messageId(result: MailSendResult | void): string | null {
  if (!result || typeof result.id !== "string") return null;
  const id = result.id.trim();
  return id || null;
}

function plainHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div>${escaped.replaceAll("\n", "<br>")}</div>`;
}

export async function sendNoJourneyHelpEmail(to: string): Promise<string | null> {
  const appUrl = `${config.appBaseUrl}/app`;
  const text = noJourneyHelpEmailText(appUrl);
  const result = await getMailer().send({
    to,
    subject: "Behöver du hjälp att komma vidare i Körpasset?",
    text,
    html: plainHtml(text),
  });
  return messageId(result);
}

export async function sendNoConnectedSupervisorHelpEmail(to: string): Promise<string | null> {
  const appUrl = `${config.appBaseUrl}/app`;
  const text = noConnectedSupervisorHelpEmailText(appUrl);
  const result = await getMailer().send({
    to,
    subject: "Behöver du hjälp att bjuda in din handledare?",
    text,
    html: plainHtml(text),
  });
  return messageId(result);
}

export function androidNotifyEmailText(): string {
  return [
    "Hej,",
    "",
    "Klart. Vi mejlar när Körpasset finns på Google Play.",
    "",
    "Hälsningar",
    "Körpasset",
  ].join("\n");
}

export function androidNotifyAdminText(signup: InterestSignup): string {
  return [
    "Ny avisering från /kom-igang. Personen vill bli mejlad när appen finns på Google Play.",
    "",
    `E-post: ${signup.email}`,
    "",
    `Admin: ${config.appBaseUrl}/admin/signups/${signup.id}`,
  ].join("\n");
}

export async function notifyAndroidPlaySignup(
  signup: InterestSignup,
  created: boolean,
): Promise<void> {
  if (!created || !config.resendApiKey) return;
  const mailer = getMailer();
  await mailer.send({
    to: signup.email,
    subject: "Vi mejlar när Körpasset finns på Google Play",
    text: androidNotifyEmailText(),
  });
  await mailer.send({
    to: WAITLIST_ADMIN_INBOX,
    subject: "Android-avisering från kom-igang",
    text: androidNotifyAdminText(signup),
  });
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
