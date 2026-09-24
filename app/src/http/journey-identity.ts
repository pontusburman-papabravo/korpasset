import { escapeHtml } from "./layout.js";

export interface JourneyIdentity {
  title: string;
  roleLine: string;
  role: "student" | "supervisor";
}

export function studentFirstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Eleven";
  return trimmed.split(/\s+/)[0] ?? "Eleven";
}

export function supervisorJourneyTitle(studentName: string | null | undefined): string {
  const first = studentFirstName(studentName);
  if (/[sxzß]$/i.test(first)) return `${first} körkortsresa`;
  return `${first}s körkortsresa`;
}

export function journeyIdentityForRole(
  role: "student" | "supervisor",
  studentName: string | null | undefined,
  licenceType = "B",
): JourneyIdentity {
  if (role === "student") {
    return {
      title: "Min körkortsresa",
      roleLine: `Elev · ${licenceType}-körkort`,
      role,
    };
  }
  return {
    title: supervisorJourneyTitle(studentName),
    roleLine: "Du är handledare",
    role,
  };
}

export function formatLastDriveMeta(lastDriveAt: Date | null): string {
  if (!lastDriveAt) return "ingen körning ännu";
  const formatted = lastDriveAt
    .toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
    .replaceAll(".", "");
  return `senast körd ${formatted}`;
}

export function pickerRoleLine(owned: boolean, lastDriveAt: Date | null): string {
  const role = owned ? "Du är elev" : "Du är handledare";
  return `${role} · ${formatLastDriveMeta(lastDriveAt)}`;
}

export function renderJourneyIdentity(
  identity: JourneyIdentity,
  options: { headingLevel?: 1 | 2 | "p" } = {},
): string {
  const level = options.headingLevel ?? 1;
  const title =
    level === "p"
      ? `<p class="journey-identity__title">${escapeHtml(identity.title)}</p>`
      : `<h${level} class="journey-identity__title">${escapeHtml(identity.title)}</h${level}>`;
  return `<div class="journey-identity">
    ${title}
    <p class="journey-identity__role">${escapeHtml(identity.roleLine)}</p>
  </div>`;
}
