import { shareUrl as canonicalShareUrl } from "./share.js";
import type { JourneyWeeklySummary } from "./weekly-summary.js";

/**
 * Plain-text product mail. Sections without real numbers are left out.
 * The tone stays factual. It does not tell the reader they should have
 * driven more, that they are behind, or that the week was a failure.
 */

const FORBIDDEN = ["du borde", "du ligger efter", "dålig vecka", "du misslyckades"];

export function weeklySummaryForbiddenPhrases(text: string): string[] {
  const lowered = text.toLocaleLowerCase("sv-SE");
  return FORBIDDEN.filter((phrase) => lowered.includes(phrase));
}

export function greetingName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

export function formatDriveMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
  if (hours > 0) return `${hours} h`;
  return `${mins} min`;
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  const digits = km >= 10 ? 0 : 1;
  return `${km.toFixed(digits).replace(".", ",")} km`;
}

export function weeklySummarySubject(summary: JourneyWeeklySummary): string {
  if (summary.completedDrives >= 1) {
    return `${summary.completedDrives} körpass den här veckan`;
  }
  if (summary.newlyCompletedSkills === 1) return "Veckan i Körpasset: 1 nytt moment klart";
  if (summary.newlyCompletedSkills > 1) {
    return `Veckan i Körpasset: ${summary.newlyCompletedSkills} nya moment klara`;
  }
  return "Din vecka i Körpasset";
}

function comparisonLines(
  summary: JourneyWeeklySummary,
  previous: JourneyWeeklySummary | null,
): string[] {
  if (!previous) return [];
  const lines: string[] = [];
  if (previous.completedDrives > 0 && summary.completedDrives !== previous.completedDrives) {
    const delta = summary.completedDrives - previous.completedDrives;
    lines.push(
      delta > 0
        ? `${delta} körpass mer än förra veckan.`
        : `${-delta} körpass färre än förra veckan.`,
    );
  }
  if (
    previous.totalDriveMinutes > 0 &&
    summary.totalDriveMinutes !== previous.totalDriveMinutes
  ) {
    const delta = summary.totalDriveMinutes - previous.totalDriveMinutes;
    const amount = formatDriveMinutes(Math.abs(delta));
    lines.push(delta > 0 ? `${amount} mer körning än förra veckan.` : `${amount} mindre körning än förra veckan.`);
  }
  if (
    previous.uniqueTrainedSkills > 0 &&
    summary.uniqueTrainedSkills !== previous.uniqueTrainedSkills
  ) {
    const delta = summary.uniqueTrainedSkills - previous.uniqueTrainedSkills;
    lines.push(
      delta > 0
        ? `${delta} moment fler än förra veckan.`
        : `${-delta} moment färre än förra veckan.`,
    );
  }
  if (previous.checkoffSteps > 0 && summary.checkoffSteps !== previous.checkoffSteps) {
    const delta = summary.checkoffSteps - previous.checkoffSteps;
    lines.push(
      delta > 0
        ? `${delta} avbockade steg fler än förra veckan.`
        : `${-delta} avbockade steg färre än förra veckan.`,
    );
  }
  return lines;
}

export function weeklyFeedback(summary: JourneyWeeklySummary): string[] {
  const lines: string[] = [];
  if (summary.firstDriveThisWeek) {
    lines.push("Du genomförde ditt första körpass i Körpasset den här veckan.");
  }
  if (summary.completedDrives >= 2) {
    lines.push(`Stark vecka – du fick in ${summary.completedDrives} körpass.`);
  }
  if (summary.newlyCompletedSkills >= 2) {
    lines.push(
      `Du tog tydliga steg framåt och bockade av ${summary.newlyCompletedSkills} nya moment.`,
    );
  } else if (summary.uniqueTrainedSkills >= 3 && summary.newlyCompletedSkills === 0) {
    lines.push(
      "Du har tränat mycket den här veckan. Fortsätt repetera i lugn takt – allt behöver inte bockas av direkt.",
    );
  }
  if (
    summary.progressionStart > 0 &&
    summary.progressionEnd !== summary.progressionStart
  ) {
    lines.push(
      `Din progression gick från ${summary.progressionStart} % till ${summary.progressionEnd} %.`,
    );
  } else if (summary.progressionEnd > 0) {
    lines.push(`Din progression är ${summary.progressionEnd} %.`);
  }
  return lines;
}

function statLines(summary: JourneyWeeklySummary): string[] {
  const lines: string[] = [];
  if (summary.completedDrives > 0) lines.push(`🚗 ${summary.completedDrives} körpass`);
  if (summary.completedDrives > 0) lines.push(`⏱ ${formatDriveMinutes(summary.totalDriveMinutes)} körning`);
  if (summary.uniqueTrainedSkills > 0) {
    lines.push(`🎯 ${summary.uniqueTrainedSkills} moment tränade`);
  }
  if (
    summary.newlyTrainedSkills > 0 &&
    summary.newlyTrainedSkills < summary.uniqueTrainedSkills
  ) {
    lines.push(`${summary.newlyTrainedSkills} av dem var nya den här veckan.`);
  }
  if (summary.newlyCompletedSkills > 0) {
    const label = summary.newlyCompletedSkills === 1 ? "nytt moment avbockat" : "nya moment avbockade";
    lines.push(`✅ ${summary.newlyCompletedSkills} ${label}`);
  } else if (summary.checkoffSteps > 0) {
    const label = summary.checkoffSteps === 1 ? "körsteg avbockat" : "körsteg avbockade";
    lines.push(`✅ ${summary.checkoffSteps} ${label}`);
  }
  if (summary.supervisorsUsed > 0) {
    lines.push(`Du körde med ${summary.supervisorsUsed} handledare.`);
  }
  if (summary.distanceMeters != null && summary.distanceMeters > 0) {
    lines.push(`Körsträcka ${formatKm(summary.distanceMeters)}.`);
  }
  return lines;
}

export function buildWeeklySummaryEmail(input: {
  displayName: string | null;
  summary: JourneyWeeklySummary;
  previous: JourneyWeeklySummary | null;
  appUrl: string;
  shareUrl?: string;
}): { subject: string; text: string; html: string } {
  const name = greetingName(input.displayName);
  const summary = input.summary;
  const tipsUrl = input.shareUrl ?? canonicalShareUrl("weekly_email");
  const paragraphs: string[] = [
    name ? `Hej ${name},` : "Hej,",
    "",
    "Här är din vecka i Körpasset.",
    "",
    ...statLines(summary),
  ];

  const comparisons = comparisonLines(summary, input.previous);
  if (comparisons.length > 0) {
    paragraphs.push("", ...comparisons);
  }

  if (summary.topSkills.length > 0) {
    paragraphs.push("", "Du tränade mest på:", "");
    for (const skill of summary.topSkills) paragraphs.push(`• ${skill.title}`);
  }

  const feedback = weeklyFeedback(summary);
  if (feedback.length > 0) paragraphs.push("", ...feedback);

  paragraphs.push(
    "",
    "Redo för nästa körpass?",
    "",
    `Öppna Körpasset: ${input.appUrl}`,
    "",
    "Gillar du Körpasset?",
    "",
    "Känner du någon som också övningskör? Tipsa gärna om Körpasset.",
    "",
    `Tipsa en vän: ${tipsUrl}`,
    "",
    "Vi hörs nästa söndag.",
    "",
    "Körpasset",
  );

  const text = paragraphs.join("\n");
  return {
    subject: weeklySummarySubject(summary),
    text,
    html: weeklySummaryHtml(text, input.appUrl, tipsUrl),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function weeklySummaryHtml(text: string, appUrl: string, shareLink: string): string {
  const link = `Öppna Körpasset: ${appUrl}`;
  const tips = `Tipsa en vän: ${shareLink}`;
  const body = text
    .split("\n")
    .map((line) => {
      if (line === link) {
        return `<p><a href="${escapeHtml(appUrl)}">Öppna Körpasset</a></p>`;
      }
      if (line === tips) {
        return `<p><a href="${escapeHtml(shareLink)}">Tipsa en vän</a></p>`;
      }
      if (line === "") return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
  return `<!DOCTYPE html><html lang="sv"><body>${body}</body></html>`;
}
