import type { AdminBetaStats, DayCount } from "../services/admin-stats.js";
import type { AdminProductStats } from "../services/admin-product-stats.js";
import { productStatsSections } from "./admin-product-pages.js";
import {
  USAGE_STATUS_LABELS,
  formatDuration,
} from "../services/usage-metrics.js";
import {
  filterUsageJourneys,
  USAGE_ACTIVE_WINDOW_MS,
  type AdminUsage,
  type UsageCount,
  type UsageJourney,
  type UsageListFilter,
} from "../services/admin-usage.js";
import type { DirectoryUser } from "../services/admin-directory.js";
import {
  DIRECTORY_ACCOUNT_STATES,
  EDITABLE_ACCOUNT_STATES,
} from "../services/admin-directory.js";
import type {
  SupportSearchResult,
  SupportUserView,
} from "../services/admin-support.js";
import { supportUserHeading } from "../services/admin-support.js";
import type { InterestRole, InterestSignup, InterestStatus } from "../services/interest.js";
import { formatInterestPlatforms, INTEREST_STATUSES } from "../services/interest.js";
import {
  escapeHtml,
  errorBanner,
  primaryButton,
  siteLayout,
  successBanner,
} from "./layout.js";
import { csvCell } from "./csv.js";
import { siteFooter, siteHeader } from "./landing.js";

export type AdminNav = "overview" | "signups" | "users" | "statistik" | "support";

const ACCOUNT_STATE_LABELS: Record<string, string> = {
  guest: "Gäst",
  active: "Aktiv",
  suspended: "Avstängd",
  deleted: "Raderad",
};

const PROVIDER_LABELS: Record<string, string> = {
  apple: "Apple",
  google: "Google",
  email_magic_link: "E-postlänk",
};

const ROLE_LABELS: Record<InterestRole, string> = {
  parent: "Förälder",
  student: "Elev",
  supervisor: "Handledare",
  other: "Annat",
};

const STATUS_LABELS: Record<InterestStatus, string> = {
  new: "Ny",
  contacted: "Kontaktad",
  invited: "Inbjuden",
  declined: "Avböjd",
};

export { ROLE_LABELS, STATUS_LABELS };

function signupDeleteForm(id: string, variant: "row" | "detail"): string {
  const action = `/admin/signups/${escapeHtml(id)}/delete`;
  if (variant === "row") {
    return `<form method="post" action="${action}" class="admin-row-delete" onsubmit="return confirm('Ta bort personen från betakön? Det går inte att ångra.');">
      <input type="hidden" name="confirm" value="yes">
      <button type="submit" class="btn-link">Ta bort</button>
    </form>`;
  }
  return `<form method="post" action="${action}" class="admin-form admin-form--danger" onsubmit="return confirm('Radera anmälan? Det går inte att ångra.');">
      <p>Radering tar bort waitlist-raden. Används vid begäran eller manuell radering före 18 månader. Anmälningar som är 18 månader gamla eller äldre tas bort automatiskt. Detta är separat från produktanvändarens account lifecycle.</p>
      <label class="interest-choice">
        <input type="checkbox" name="confirm" value="yes" required>
        <span>Jag vill radera den här anmälan.</span>
      </label>
      ${primaryButton("Radera anmälan")}
    </form>`;
}

export function adminPage(
  title: string,
  body: string,
  options: { signedIn?: boolean; nav?: AdminNav } = {},
): string {
  return siteLayout(
    title,
    `${siteHeader({
      variant: "admin",
      signedIn: options.signedIn,
      adminNav: options.signedIn ? options.nav : undefined,
    })}${body}${siteFooter({ cookiePolicy: false, cookieSettings: false })}`,
    { robots: "noindex, nofollow", path: "/admin", consent: false },
  );
}

export function notConfigured() {
  return {
    status: 404 as const,
    html: siteLayout(
      "Inte hittad",
      `${siteHeader()}<main class="site-section"><div class="site-inner site-inner--narrow"><h1>Sidan finns inte</h1></div></main>${siteFooter()}`,
      { robots: "noindex, nofollow" },
    ),
  };
}

export function loginPage(options: { errorMessage?: string; successMessage?: string } = {}): string {
  return adminPage(
    "Admin",
    `<main class="site-section site-section--cream">
       <div class="site-inner site-inner--narrow">
         <h1>Admin</h1>
         <p>Betauppföljning för Körpasset.</p>
         ${options.successMessage ? successBanner(options.successMessage) : ""}
         ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
         <form method="post" action="/admin/login" class="admin-form">
           <div>
             <label for="email">E-post</label>
             <input id="email" name="email" type="email" required autocomplete="username">
           </div>
           <div>
             <label for="password">Lösenord</label>
             <input id="password" name="password" type="password" required autocomplete="current-password">
           </div>
           ${primaryButton("Logga in")}
         </form>
         <p><a href="/admin/forgot-password">Glömt lösenord?</a></p>
       </div>
     </main>`,
  );
}

export function forgotPage(message?: { kind: "ok" | "error"; text: string }): string {
  return adminPage(
    "Glömt lösenord",
    `<main class="site-section site-section--cream">
       <div class="site-inner site-inner--narrow">
         <h1>Glömt lösenord</h1>
         <p>Ange e-postadressen för admin-kontot.</p>
         ${message?.kind === "ok" ? successBanner(message.text) : ""}
         ${message?.kind === "error" ? errorBanner(message.text) : ""}
         <form method="post" action="/admin/forgot-password" class="admin-form">
           <div>
             <label for="email">E-post</label>
             <input id="email" name="email" type="email" required autocomplete="username">
           </div>
           ${primaryButton("Skicka länk")}
         </form>
         <p><a href="/admin/login">Tillbaka till inloggning</a></p>
       </div>
     </main>`,
  );
}

export function resetPage(options: { token?: string; errorMessage?: string }): string {
  return adminPage(
    "Nytt lösenord",
    `<main class="site-section site-section--cream">
       <div class="site-inner site-inner--narrow">
         <h1>Välj nytt lösenord</h1>
         ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
         <form method="post" action="/admin/reset-password" class="admin-form">
           <input type="hidden" name="token" value="${escapeHtml(options.token ?? "")}">
           <div>
             <label for="password">Nytt lösenord</label>
             <input id="password" name="password" type="password" required minlength="12" autocomplete="new-password">
           </div>
           <div>
             <label for="confirm">Upprepa lösenord</label>
             <input id="confirm" name="confirm" type="password" required minlength="12" autocomplete="new-password">
           </div>
           ${primaryButton("Spara lösenord")}
         </form>
       </div>
     </main>`,
  );
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}

export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

function kpi(label: string, value: string, hint?: string): string {
  return `<article class="admin-kpi">
    <p class="admin-kpi__label">${escapeHtml(label)}</p>
    <p class="admin-kpi__value">${escapeHtml(value)}</p>
    ${hint ? `<p class="muted">${escapeHtml(hint)}</p>` : ""}
  </article>`;
}

function ratio(part: number, whole: number): string {
  if (whole === 0) return `${part} / ${whole}`;
  const pct = Math.round((part / whole) * 100);
  return `${part} / ${whole} (${pct} %)`;
}

function barChart(title: string, series: DayCount[]): string {
  const max = Math.max(1, ...series.map((point) => point.count));
  const bars = series
    .map((point) => {
      const height = Math.round((point.count / max) * 100);
      return `<div class="admin-chart__bar" title="${escapeHtml(point.day)}: ${point.count}">
        <span style="height:${height}%"></span>
      </div>`;
    })
    .join("");
  const first = series[0]?.day;
  const last = series[series.length - 1]?.day;
  return `<figure class="admin-chart">
    <figcaption>${escapeHtml(title)}</figcaption>
    <div class="admin-chart__bars" role="img" aria-label="${escapeHtml(title)}">${bars}</div>
    <p class="muted">${first ? escapeHtml(formatDay(first)) : ""} – ${last ? escapeHtml(formatDay(last)) : ""} · max ${max}/dag</p>
  </figure>`;
}

function searchForm(query = ""): string {
  return `<form method="get" action="/admin/support" class="admin-search" role="search">
    <label for="q">Supportsök</label>
    <div class="admin-search__row">
      <input id="q" name="q" type="search" value="${escapeHtml(query)}" placeholder="E-post, användar-UUID eller namn">
      ${primaryButton("Sök")}
    </div>
    <p class="muted">Waitlist via e-post. Produktanvändare via e-post, UUID, inloggningsidentitet eller namn. <a href="/admin/users">Öppna hela användarlistan</a>.</p>
  </form>`;
}

export function overviewPage(options: {
  stats: AdminBetaStats;
  recent: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    createdAt: string;
  }>;
}): string {
  const { stats, recent } = options;
  const recentRows = recent
    .map((signup) => {
      const status = STATUS_LABELS[signup.status as InterestStatus] ?? signup.status;
      return `<tr>
        <td><a href="/admin/signups/${escapeHtml(signup.id)}">${escapeHtml(signup.name)}</a>
          <div class="muted">${escapeHtml(signup.email)}</div></td>
        <td><span class="status status--${escapeHtml(signup.status)}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(formatWhen(signup.createdAt))}</td>
      </tr>`;
    })
    .join("");

  return adminPage(
    "Översikt",
    `<main class="admin-shell">
       <h1>Översikt</h1>
       <p>Beta-puls från produktdata. Gate: 25 aktiva elevresor.</p>
       <section class="admin-kpis" aria-label="Waitlist">
         ${kpi("Nya intresseanmälningar 7 dagar", String(stats.waitlistNew7d), "Europe/Stockholm")}
         ${kpi("Nya intresseanmälningar 30 dagar", String(stats.waitlistNew30d))}
       </section>
       <section class="admin-kpis" aria-label="Beta Validation">
         ${kpi(
           "Aktiva elevresor",
           `${stats.activeJourneys} / ${stats.betaGateTarget}`,
           "Kärnloop: handledare, Drive Focus, completed + rated drive",
         )}
         ${kpi(
           "First Drive Completion",
           `${stats.firstDriveCompletion.completedCoreLoop} av ${stats.firstDriveCompletion.firstJourneys || 25}`,
           `Mål: ${stats.firstDriveCompletion.target} av de första 25`,
         )}
         ${kpi(
           "Second Drive Rate",
           ratio(
             stats.secondDriveRate.withSecondWithin14d,
             stats.secondDriveRate.withFirstRatedDrive,
           ),
           `${stats.secondDriveRate.first25WithSecondWithin14d} av ${stats.secondDriveRate.first25Active} första aktiva inom 14 dagar (mål ${stats.secondDriveRate.targetOfFirst25}/25)`,
         )}
         ${kpi("Resor med fler än en handledare", String(stats.multiSupervisorJourneys))}
       </section>
       <section class="admin-kpis" aria-label="Körpass">
         ${kpi("Skapade körpass 7/30 dagar", `${stats.drivesCreated7d} / ${stats.drivesCreated30d}`)}
         ${kpi("Genomförda körpass 7/30 dagar", `${stats.drivesCompleted7d} / ${stats.drivesCompleted30d}`)}
         ${kpi("Öppna körpass", String(stats.drivesOpen), "ended_at IS NULL")}
       </section>
       <section class="admin-kpis" aria-label="Systemhälsa">
         ${kpi("E-post bounce 24 h", String(stats.emailBounces24h), "resend_webhook_events")}
         ${kpi("E-post complaint 24 h", String(stats.emailComplaints24h))}
       </section>
       <section>
         <h2>Senaste intresseanmälningar</h2>
         <table class="admin-table">
           <thead><tr><th>Namn</th><th>Status</th><th>Inkommen</th></tr></thead>
           <tbody>
             ${recentRows || `<tr><td colspan="3">Inga anmälningar ännu.</td></tr>`}
           </tbody>
         </table>
         <p><a href="/admin/signups">Alla intresseanmälningar</a></p>
       </section>
       ${searchForm()}
     </main>`,
    { signedIn: true, nav: "overview" },
  );
}

export function signupsListPage(options: {
  signups: InterestSignup[];
  newCount: number;
  total: number;
  page: number;
  pageSize: number;
  status?: InterestStatus;
}): string {
  const { signups, newCount, total, page, pageSize, status } = options;
  const rows = signups
    .map((signup) => {
      const preview = signup.message ? escapeHtml(signup.message.slice(0, 80)) : "—";
      return `<tr>
        <td><a href="/admin/signups/${escapeHtml(signup.id)}">${escapeHtml(signup.name)}</a><div class="muted">${escapeHtml(signup.email)}</div></td>
        <td>${escapeHtml(ROLE_LABELS[signup.role])}</td>
        <td>${escapeHtml(formatInterestPlatforms(signup))}</td>
        <td><span class="status status--${signup.status}">${escapeHtml(STATUS_LABELS[signup.status])}</span></td>
        <td>${escapeHtml(signup.city ?? "—")}</td>
        <td>${preview}</td>
        <td>${escapeHtml(formatWhen(signup.createdAt))}</td>
        <td>${signupDeleteForm(signup.id, "row")}</td>
      </tr>`;
    })
    .join("");

  const filters = ["all", ...INTEREST_STATUSES]
    .map((value) => {
      const href = value === "all" ? "/admin/signups" : `/admin/signups?status=${value}`;
      const label = value === "all" ? "Alla" : STATUS_LABELS[value as InterestStatus];
      const current = (value === "all" && !status) || value === status;
      return `<a href="${href}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
    })
    .join(" · ");

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const statusQuery = status ? `&status=${status}` : "";
  const csvHref = status ? `/admin/signups.csv?status=${status}` : "/admin/signups.csv";
  const prev =
    page > 1
      ? `<a href="/admin/signups?page=${page - 1}${statusQuery}">Föregående</a>`
      : `<span class="muted">Föregående</span>`;
  const next =
    page < pageCount
      ? `<a href="/admin/signups?page=${page + 1}${statusQuery}">Nästa</a>`
      : `<span class="muted">Nästa</span>`;

  return adminPage(
    "Intresseanmälningar",
    `<main class="admin-shell">
       <h1>Intresseanmälningar</h1>
       <p>${newCount} nya · ${from}–${to} av ${total}</p>
       <div class="admin-toolbar">
         <div>${filters}</div>
         <a href="${csvHref}">Ladda ner CSV</a>
       </div>
       <table class="admin-table">
         <thead>
           <tr><th>Namn</th><th>Roll</th><th>Plattform</th><th>Status</th><th>Ort</th><th>Meddelande</th><th>Inkommen</th><th>Åtgärd</th></tr>
         </thead>
         <tbody>
           ${rows || `<tr><td colspan="8">Inga anmälningar ännu.</td></tr>`}
         </tbody>
       </table>
       <nav class="admin-pagination" aria-label="Paginering">
         ${prev} · sida ${page} av ${pageCount} · ${next}
       </nav>
     </main>`,
    { signedIn: true, nav: "signups" },
  );
}

export function signupDetailPage(signup: InterestSignup): string {
  const options = INTEREST_STATUSES.map((status) => {
    const selected = status === signup.status ? " selected" : "";
    return `<option value="${status}"${selected}>${escapeHtml(STATUS_LABELS[status])}</option>`;
  }).join("");

  return adminPage(
    signup.name,
    `<main class="admin-shell">
       <p><a href="/admin/signups">← Alla anmälningar</a></p>
       <h1>${escapeHtml(signup.name)}</h1>
       <p>${escapeHtml(signup.email)} · ${escapeHtml(ROLE_LABELS[signup.role])} · ${escapeHtml(formatInterestPlatforms(signup))} · ${escapeHtml(signup.city ?? "Ingen ort")}</p>
       <p>Inkommen ${escapeHtml(formatWhen(signup.createdAt))}</p>
       ${signup.message ? `<blockquote>${escapeHtml(signup.message)}</blockquote>` : "<p class=\"muted\">Inget meddelande.</p>"}
       <form method="post" action="/admin/signups/${escapeHtml(signup.id)}" class="admin-form">
         <div>
           <label for="status">Status</label>
           <select id="status" name="status">${options}</select>
         </div>
         <div>
           <label for="admin_note">Intern anteckning</label>
           <textarea id="admin_note" name="admin_note" rows="4">${escapeHtml(signup.adminNote ?? "")}</textarea>
         </div>
         ${primaryButton("Spara")}
       </form>
       ${signupDeleteForm(signup.id, "detail")}
     </main>`,
    { signedIn: true, nav: "signups" },
  );
}

const USAGE_SOURCE_LABELS: Record<string, string> = {
  direct: "Eleven själv",
  parent_handoff: "Via handledare",
  unknown: "Okänd",
};

const USAGE_STAGE_LABELS: Record<string, string> = {
  unknown: "Inte angivet",
  just_started: "Precis börjat",
  building: "Bygger på",
  near_test: "Nära uppkörning",
};

const USAGE_TRANSMISSION_LABELS: Record<string, string> = {
  unknown: "Inte angivet",
  manual: "Manuell",
  automatic_only: "Automat",
};

const USAGE_SUPERVISOR_LABELS: Record<string, string> = {
  "0": "Ingen handledare",
  "1": "En handledare",
  "2+": "Flera handledare",
};

const USAGE_STUCK_LABELS: Record<string, string> = {
  no_journey: "Fastnat: resan är inte skapad",
  no_supervisor: "Fastnat: handledaren är inte ansluten",
  no_drive: "Fastnat: första passet är inte startat",
  drive_open: "Fastnat: första passet är inte avslutat",
  no_rating: "Fastnat: första bedömningen saknas",
  no_second: "Fastnat: andra passet är inte gjort",
  through: "Andra passet gjort",
};

const USAGE_ASSESSMENT_LABELS: Record<string, string> = {
  needs_help: "Behöver hjälp",
  with_support: "Med stöd",
  independent: "Självständigt",
};

const USAGE_CONTEXT_LABELS: Record<string, string> = {
  residential: "Villaområde",
  urban: "Tätort",
  rural: "Landsväg",
  highway: "Motorväg",
  daylight: "Dagsljus",
  dusk_dawn: "Skymning",
  night: "Mörker",
  dry: "Torrt",
  rain: "Regn",
  snow_ice: "Snö eller halka",
  fog: "Dimma",
  light: "Lätt trafik",
  moderate: "Måttlig trafik",
  heavy: "Tät trafik",
};

const USAGE_EVENT_LABELS: Record<string, string> = {
  onboarding_student: "Sidinträde, elevspår",
  onboarding_supervisor: "Sidinträde, handledarspår",
  student_handoff_started: "Eleven öppnade handledarens länk",
  recap_viewed: "Recap visad",
  next_drive_plan_created: "Plan för nästa pass skapad",
  next_drive_plan_updated: "Plan för nästa pass uppdaterad",
  training_guidance_opened: "Övningsguide öppnad",
  stale_drive_nudge_shown: "Påminnelse om vilande pass",
};

function usageLabel(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}

function countTable(caption: string, rows: UsageCount[], labels: Record<string, string>): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(usageLabel(labels, row.key))}</td><td>${row.count}</td></tr>`,
    )
    .join("");
  return `<h3>${escapeHtml(caption)}</h3>
  <table class="admin-table">
    <thead><tr><th>Grupp</th><th>Antal</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function contextTable(
  caption: string,
  rows: UsageCount[],
  missing: number,
  missingLabel: string,
): string {
  return countTable(caption, [...rows, { key: missingLabel, count: missing }], {
    ...USAGE_CONTEXT_LABELS,
    [missingLabel]: missingLabel,
  });
}

function stockholmDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

export function formatLastActive(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const day = stockholmDay(date);
  const today = stockholmDay(now);
  if (day === today) return `idag ${time}`;
  if (day === shiftDay(today, -1)) return `igår ${time}`;
  return formatWhen(iso);
}

function formatClient(client: UsageJourney["student"]["client"]): string {
  if (!client.platform) return "";
  const name = client.platform === "ios" ? "iOS" : "Android";
  if (client.appVersion && client.appBuild) return `${name} ${client.appVersion} (${client.appBuild})`;
  if (client.appVersion) return `${name} ${client.appVersion}`;
  return name;
}

function platformCell(journey: UsageJourney): string {
  const reported = formatClient(journey.student.client);
  if (reported) return escapeHtml(reported);
  if (journey.waitlist && (journey.waitlist.platformIos || journey.waitlist.platformAndroid)) {
    const claimed = formatInterestPlatforms({
      platformIos: journey.waitlist.platformIos,
      platformAndroid: journey.waitlist.platformAndroid,
    });
    return `<span class="muted">Anmälan: ${escapeHtml(claimed)}</span>`;
  }
  return `<span class="muted">Inte rapporterad</span>`;
}

function journeyRows(journeys: UsageJourney[]): string {
  return journeys
    .map((journey) => {
      const supervisors =
        journey.supervisors.length === 0
          ? "—"
          : journey.supervisors
              .map((person) => {
                const name = person.removed ? `${person.name} (borttagen)` : person.name;
                const client = formatClient(person.client);
                const device = client ? `<div class="muted">${escapeHtml(client)}</div>` : "";
                return `<a href="/admin/users/${escapeHtml(person.userId)}">${escapeHtml(name)}</a>${device}`;
              })
              .join("<br>");
      const waitlist = journey.waitlist
        ? `<a href="/admin/signups/${escapeHtml(journey.waitlist.id)}">${escapeHtml(STATUS_LABELS[journey.waitlist.status as InterestStatus] ?? journey.waitlist.status)}</a>`
        : "—";
      const student = journey.journeyId
        ? `<a href="/admin/statistik/resa/${escapeHtml(journey.journeyId)}">${escapeHtml(journey.student.name)}</a>`
        : `<a href="/admin/users/${escapeHtml(journey.student.userId)}">${escapeHtml(journey.student.name)}</a>`;
      const supervisorCount =
        journey.pendingInvites > 0
          ? `${journey.activeSupervisors} <span class="muted">+${journey.pendingInvites} inbjudna</span>`
          : String(journey.activeSupervisors);
      return `<tr data-last-active="${escapeHtml(journey.lastActivityAt)}" data-stuck="${escapeHtml(journey.stuck)}" data-completed="${journey.drivesCompleted}" data-created="${escapeHtml(journey.createdAt)}" data-supervisors="${journey.activeSupervisors}" data-checkoffs="${journey.checkoffSteps}" data-progression="${journey.progressionPercent}" data-has-journey="${journey.journeyId ? "1" : "0"}" data-status="${escapeHtml(journey.status)}">
        <td>${student}</td>
        <td>${escapeHtml(formatWhen(journey.createdAt))}</td>
        <td>${escapeHtml(formatLastActive(journey.lastActivityAt))}</td>
        <td>${journey.lastCompletedAt ? escapeHtml(formatWhen(journey.lastCompletedAt)) : "—"}</td>
        <td>${journey.drivesCompleted}</td>
        <td>${journey.drivesCompleted30d}</td>
        <td>${escapeHtml(formatDuration(journey.durationSeconds))}</td>
        <td>${journey.trainedObservations}</td>
        <td>${journey.uniqueSkillsTrained}</td>
        <td>${journey.checkoffSteps}</td>
        <td>${journey.progressionPercent} %</td>
        <td>${supervisorCount}</td>
        <td>${escapeHtml(USAGE_STATUS_LABELS[journey.status])}</td>
        <td>${escapeHtml(usageLabel(USAGE_STUCK_LABELS, journey.stuck))}</td>
        <td>${platformCell(journey)}</td>
        <td>${supervisors}</td>
        <td>${waitlist}</td>
      </tr>`;
    })
    .join("");
}

export function usageCsv(journeys: UsageJourney[]): string {
  const header = [
    "senaste",
    "skapad",
    "journey_id",
    "elev",
    "elev_id",
    "handledare",
    "vag_in",
    "ovningslage",
    "vaxel",
    "korpass_genomforda",
    "korpass_startade",
    "bedomda",
    "fastnat",
    "plattform",
    "appversion",
    "appbuild",
    "anmalan_status",
    "anmalan_id",
    "status",
    "korpass_30d",
    "kortid_sekunder",
    "tranade_moment",
    "unika_moment",
    "avbockningar",
    "progression_procent",
    "handledare_aktiva",
    "senaste_korpass",
  ].join(",");
  const lines = journeys.map((journey) =>
    [
      journey.lastActivityAt,
      journey.createdAt,
      journey.journeyId,
      csvCell(journey.student.name),
      journey.student.userId,
      csvCell(
        journey.supervisors
          .map((person) => {
            const name = person.removed ? `${person.name} (borttagen)` : person.name;
            const client = formatClient(person.client);
            return client ? `${name} (${client})` : name;
          })
          .join("; "),
      ),
      csvCell(usageLabel(USAGE_SOURCE_LABELS, journey.source)),
      csvCell(usageLabel(USAGE_STAGE_LABELS, journey.practiceStage)),
      csvCell(usageLabel(USAGE_TRANSMISSION_LABELS, journey.transmission)),
      String(journey.drivesCompleted),
      String(journey.drivesStarted),
      String(journey.ratedDrives),
      csvCell(usageLabel(USAGE_STUCK_LABELS, journey.stuck)),
      csvCell(formatClient(journey.student.client)),
      csvCell(journey.student.client.appVersion ?? ""),
      csvCell(journey.student.client.appBuild ?? ""),
      csvCell(
        journey.waitlist
          ? (STATUS_LABELS[journey.waitlist.status as InterestStatus] ?? journey.waitlist.status)
          : "",
      ),
      journey.waitlist?.id ?? "",
      csvCell(USAGE_STATUS_LABELS[journey.status] ?? journey.status),
      String(journey.drivesCompleted30d),
      String(Math.round(journey.durationSeconds)),
      String(journey.trainedObservations),
      String(journey.uniqueSkillsTrained),
      String(journey.checkoffSteps),
      String(journey.progressionPercent),
      String(journey.activeSupervisors),
      journey.lastCompletedAt ?? "",
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

const USAGE_FILTERS: Array<[UsageListFilter, string]> = [
  ["all", "Alla"],
  ["active7", "Aktiva senaste 7 dagarna"],
  ["active30", "Aktiva senaste 30 dagarna"],
  ["stuck", "Fastnat"],
  ["drives0", "0 körpass"],
  ["drives1", "1 körpass"],
  ["two", "2+ pass"],
  ["drives5", "5+ körpass"],
  ["drives10", "10+ körpass"],
  ["no_supervisor", "Resa utan handledare"],
  ["has_supervisor", "Har handledare"],
  ["has_checkoffs", "Har avbockningar"],
  ["no_checkoffs", "Saknar avbockningar"],
  ["registered7", "Registrerade 7 dagar"],
  ["registered30", "Registrerade 30 dagar"],
  ["progress0", "Progression 0 %"],
  ["progress1", "Progression 1–24 %"],
  ["progress25", "Progression 25–49 %"],
  ["progress50", "Progression 50–74 %"],
  ["progress75", "Progression 75–99 %"],
  ["progress100", "Progression 100 %"],
];

function usageFilterBar(journeys: UsageJourney[]): string {
  const buttons = USAGE_FILTERS.map(([value, label]) => {
    const count = filterUsageJourneys(journeys, value).length;
    const pressed = value === "all" ? "true" : "false";
    return `<button type="button" data-usage-filter="${value}" aria-pressed="${pressed}">${escapeHtml(label)} (${count})</button>`;
  }).join("");
  return `<div class="admin-usage-filter" role="group" aria-label="Filtrera tabellen">${buttons}</div>`;
}

function usageFilterScript(): string {
  return `<script>
    (function () {
      var table = document.getElementById("usage-journeys");
      if (!table) return;
      var rows = Array.prototype.filter.call(table.querySelectorAll("tbody tr"), function (row) {
        return row.hasAttribute("data-stuck");
      });
      var none = table.querySelector("[data-usage-none]");
      var buttons = document.querySelectorAll("[data-usage-filter]");
      var csv = document.querySelector("[data-usage-csv]");
      var week = ${USAGE_ACTIVE_WINDOW_MS};
      var month = 30 * 24 * 60 * 60 * 1000;
      function match(row, filter) {
        var completed = Number(row.getAttribute("data-completed"));
        var supervisors = Number(row.getAttribute("data-supervisors"));
        var checkoffs = Number(row.getAttribute("data-checkoffs"));
        var progression = Number(row.getAttribute("data-progression"));
        var created = Date.parse(row.getAttribute("data-created"));
        var last = Date.parse(row.getAttribute("data-last-active"));
        if (filter === "active7") return Date.now() - last <= week;
        if (filter === "active30") return Date.now() - last <= month;
        if (filter === "stuck") return row.getAttribute("data-stuck") !== "through";
        if (filter === "two") return completed >= 2;
        if (filter === "drives0") return completed === 0;
        if (filter === "drives1") return completed === 1;
        if (filter === "drives5") return completed >= 5;
        if (filter === "drives10") return completed >= 10;
        if (filter === "no_supervisor") {
          return row.getAttribute("data-has-journey") === "1" && supervisors === 0;
        }
        if (filter === "has_supervisor") return supervisors >= 1;
        if (filter === "has_checkoffs") return checkoffs > 0;
        if (filter === "no_checkoffs") return checkoffs === 0;
        if (filter === "registered7") return Date.now() - created <= week;
        if (filter === "registered30") return Date.now() - created <= month;
        if (filter === "progress0") return progression <= 0;
        if (filter === "progress1") return progression >= 1 && progression <= 24;
        if (filter === "progress25") return progression >= 25 && progression <= 49;
        if (filter === "progress50") return progression >= 50 && progression <= 74;
        if (filter === "progress75") return progression >= 75 && progression <= 99;
        if (filter === "progress100") return progression >= 100;
        return true;
      }
      function apply(filter) {
        var shown = 0;
        Array.prototype.forEach.call(rows, function (row) {
          var ok = match(row, filter);
          row.hidden = !ok;
          if (ok) shown += 1;
        });
        if (none) none.hidden = shown !== 0;
        Array.prototype.forEach.call(buttons, function (button) {
          button.setAttribute("aria-pressed", button.getAttribute("data-usage-filter") === filter ? "true" : "false");
        });
        if (csv) {
          csv.setAttribute("href", filter === "all" ? "/admin/statistik.csv" : "/admin/statistik.csv?filter=" + encodeURIComponent(filter));
        }
      }
      Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener("click", function () {
          apply(button.getAttribute("data-usage-filter"));
        });
      });
    })();
  </script>`;
}

export function statistikPage(
  stats: AdminBetaStats,
  usage: AdminUsage,
  product: AdminProductStats,
): string {
  const funnel = [
    ["journey_created", stats.funnel.journeyCreated],
    ["supervisor_connected", stats.funnel.supervisorConnected],
    ["första körpasset", stats.funnel.firstDrive],
    ["första rated/completed drive", stats.funnel.firstRatedCompletedDrive],
    ["second_drive_completed", stats.funnel.secondDriveCompleted],
  ] as const;

  return adminPage(
    "Statistik",
    `<main class="admin-shell admin-shell--wide">
       <h1>Statistik</h1>
       <p>Hur Körpasset används, räknat från körpass, moment och konton. Tabellen visar vem som fortfarande testar. Europe/Stockholm.</p>
       ${productStatsSections(product)}
       <h2>Beta-puls</h2>
       <p class="muted">Den tidigare betamätningen ligger kvar under användningsstatistiken.</p>
       <section class="admin-kpis">
         ${kpi("Nya intresseanmälningar 7/30", `${stats.waitlistNew7d} / ${stats.waitlistNew30d}`)}
         ${kpi("Aktiva elevresor", `${stats.activeJourneys} / ${stats.betaGateTarget}`)}
         ${kpi(
           "First Drive Completion",
           `${stats.firstDriveCompletion.completedCoreLoop} / ${stats.firstDriveCompletion.firstJourneys || 25}`,
         )}
         ${kpi(
           "Second Drive Rate",
           ratio(
             stats.secondDriveRate.withSecondWithin14d,
             stats.secondDriveRate.withFirstRatedDrive,
           ),
         )}
         ${kpi("Fler än en handledare", String(stats.multiSupervisorJourneys))}
         ${kpi("Skapade körpass 7/30", `${stats.drivesCreated7d} / ${stats.drivesCreated30d}`)}
         ${kpi("Genomförda körpass 7/30", `${stats.drivesCompleted7d} / ${stats.drivesCompleted30d}`)}
         ${kpi("Öppna körpass", String(stats.drivesOpen))}
         ${kpi("Canonical observationer", String(stats.canonicalObservations), "ej superseded")}
       </section>
       <section>
         <h2>Beta-funnel</h2>
         <ol class="admin-funnel">
           ${funnel
             .map(
               ([label, count]) =>
                 `<li><span>${escapeHtml(label)}</span><strong>${count}</strong></li>`,
             )
             .join("")}
         </ol>
         <p class="muted">recap_viewed lagras inte i produktdata och mäts därför inte här.</p>
       </section>
       <section class="admin-charts">
         ${barChart("Skapade körpass per dag, 30 dagar", stats.drivesCreatedPerDay)}
         ${barChart("Genomförda körpass per dag, 30 dagar", stats.drivesCompletedPerDay)}
       </section>
       <section>
         <h2>Vilka som använder appen</h2>
         <p>${usage.studentAccounts} elevkonton · ${usage.supervisorAccounts} handledarkonton · ${usage.accountsWithoutJourney} konton utan resa.</p>
         <p class="muted">${usage.journeyTotal} elevresor, senast aktiva först. Klicka elevens namn för tidslinjen. Senast aktiv är senaste appöppning, handledarkoppling, körpass eller bedömning. Filtret Aktiv använder den tiden. Status räknas på servern från avslutade körpass. Plattform och build kommer från appen. “Anmälan:” är vad de kryssade i på väntelistan.</p>
         ${usageFilterBar(usage.journeys)}
         <p><a href="/admin/statistik.csv" data-usage-csv>Ladda ner resorna som CSV</a></p>
         <div class="admin-table-wrap">
           <table class="admin-table" id="usage-journeys">
             <thead>
               <tr>
                 <th>Elev</th><th>Registrerad</th><th>Senast aktiv</th><th>Senaste körpass</th><th>Antal körpass</th><th>Körpass 30 dagar</th><th>Körtid</th><th>Tränade moment</th><th>Unika moment</th><th>Avbockningar</th><th>Progression</th><th>Antal handledare</th><th>Status</th><th>Fastnat</th><th>Plattform</th><th>Handledare</th><th>Anmälan</th>
               </tr>
             </thead>
             <tbody>
               ${
                 journeyRows(usage.journeys) ||
                 `<tr><td colspan="17">Ingen användning ännu.</td></tr>`
               }
               ${
                 usage.journeys.length > 0
                   ? `<tr data-usage-none hidden><td colspan="17">Inga rader i det här urvalet.</td></tr>`
                   : ""
               }
             </tbody>
           </table>
         </div>
         ${usageFilterScript()}
       </section>
       <section>
         <h2>På vilket sätt</h2>
         <div class="admin-table-wrap">
           ${countTable("Väg in i resan", usage.bySource, USAGE_SOURCE_LABELS)}
           ${countTable("Var i övningen", usage.byPracticeStage, USAGE_STAGE_LABELS)}
           ${countTable("Växellåda", usage.byTransmission, USAGE_TRANSMISSION_LABELS)}
           ${countTable("Handledare på resan", usage.bySupervisorCount, USAGE_SUPERVISOR_LABELS)}
         </div>
         <p>Körpass startade av eleven: ${usage.drivesStartedByStudent}. Av en handledare: ${usage.drivesStartedBySupervisor}.</p>
         ${countTable("Hur passen bedömts", usage.byAssessment, USAGE_ASSESSMENT_LABELS)}
         <h3>Moment som valts till körpass</h3>
         <table class="admin-table">
           <thead><tr><th>Moment</th><th>Körpass</th></tr></thead>
           <tbody>
             ${
               usage.focusSkills.length === 0
                 ? `<tr><td colspan="2">Inga moment valda ännu.</td></tr>`
                 : usage.focusSkills
                     .map(
                       (skill) =>
                         `<tr><td>${escapeHtml(skill.title)}</td><td>${skill.drives}</td></tr>`,
                     )
                     .join("")
             }
           </tbody>
         </table>
         ${usage.otherFocusSkills > 0 ? `<p class="muted">${usage.otherFocusSkills} ytterligare moment finns i datan.</p>` : ""}
         <h3>Sammanhang på körpassen</h3>
         <p class="muted">Ett pass kan räknas i flera miljöer. Inte angivet betyder att fältet lämnades tomt.</p>
         <div class="admin-table-wrap">
           ${contextTable("Miljö", usage.byEnvironment, usage.environmentMissing, "Miljö inte angiven")}
           ${contextTable("Ljus", usage.byLight, usage.lightMissing, "Ljus inte angivet")}
           ${contextTable("Väder", usage.byWeather, usage.weatherMissing, "Väder inte angivet")}
           ${contextTable("Trafik", usage.byTraffic, usage.trafficMissing, "Trafik inte angiven")}
         </div>
       </section>
       <section>
         <h2>Sidinträden</h2>
         <p class="muted">Det här är antal händelser, inte unika personer. Ett sidinträde och en senare resa går inte att koppla till samma människa.</p>
         ${countTable("Händelser", usage.events, USAGE_EVENT_LABELS)}
       </section>
     </main>`,
    { signedIn: true, nav: "statistik" },
  );
}

function matchReasonLabel(reason: string): string {
  if (reason === "uuid") return "UUID";
  if (reason === "auth_identity") return "inloggningsidentitet";
  if (reason === "contact_email") return "kontaktadress";
  return "namn (svagt uppslag)";
}

function accountStateLabel(state: string): string {
  return ACCOUNT_STATE_LABELS[state] ?? state;
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function roleLabel(role: "student" | "supervisor"): string {
  return role === "student" ? "Elev" : "Handledare";
}

function usersQuery(params: { q?: string; state?: string; page?: number; csv?: boolean }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.state) search.set("state", params.state);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const path = params.csv ? "/admin/users.csv" : "/admin/users";
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function directoryName(user: DirectoryUser): string {
  if (user.accountState === "deleted") {
    if (user.roles.includes("supervisor")) return "Tidigare handledare";
    if (user.roles.includes("student")) return "Tidigare elev";
    return "Tidigare användare";
  }
  return user.displayName?.trim() || "Produktanvändare";
}

function directoryRemoveForm(user: DirectoryUser, returnState?: string): string {
  if (user.accountState !== "guest" && user.accountState !== "deleted") return "—";
  const question =
    user.accountState === "deleted"
      ? "Ta bort den raderade raden från listan?"
      : "Ta bort gästen från listan? Sitter hen på en resa frikopplas hen.";
  return `<form method="post" action="/admin/users/${escapeHtml(user.id)}/remove-from-list" class="admin-row-delete" onsubmit='return confirm(${JSON.stringify(question)});'>
    <input type="hidden" name="confirm" value="yes">
    <input type="hidden" name="return_state" value="${escapeHtml(returnState ?? "")}">
    <button type="submit" class="btn-link">Ta bort</button>
  </form>`;
}

export function usersListPage(options: {
  users: DirectoryUser[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  state?: string;
  successMessage?: string;
  errorMessage?: string;
}): string {
  const { users, total, page, pageSize, query, state, successMessage, errorMessage } = options;
  const rows = users
    .map((user) => {
      const emails = user.emails.length > 0 ? user.emails.join(", ") : "—";
      const roles = user.roles.length > 0 ? user.roles.map(roleLabel).join(", ") : "—";
      return `<tr>
        <td><a href="/admin/users/${escapeHtml(user.id)}">${escapeHtml(directoryName(user))}</a>
          <div class="muted">${escapeHtml(user.id)}</div></td>
        <td>${escapeHtml(emails)}</td>
        <td><span class="status status--${escapeHtml(user.accountState)}">${escapeHtml(accountStateLabel(user.accountState))}</span></td>
        <td>${escapeHtml(roles)}</td>
        <td>${escapeHtml(user.providers.map(providerLabel).join(", ") || "—")}</td>
        <td>${escapeHtml(formatWhen(user.createdAt))}</td>
        <td>${directoryRemoveForm(user, state)}</td>
      </tr>`;
    })
    .join("");

  const filters = [
    ["", "Konton"],
    ["active", "Aktiv"],
    ["suspended", "Avstängd"],
    ["guest", "Gäst"],
    ["deleted", "Raderad"],
    ["all", "Alla"],
  ]
    .map(([value, label]) => {
      const href = usersQuery({
        q: query || undefined,
        state: value || undefined,
      });
      const current = (value === "" && !state) || value === state;
      return `<a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
    })
    .join(" · ");

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const prev =
    page > 1
      ? `<a href="${escapeHtml(usersQuery({ q: query || undefined, state, page: page - 1 }))}">Föregående</a>`
      : `<span class="muted">Föregående</span>`;
  const next =
    page < pageCount
      ? `<a href="${escapeHtml(usersQuery({ q: query || undefined, state, page: page + 1 }))}">Nästa</a>`
      : `<span class="muted">Nästa</span>`;
  const stateOptions = [
    ["", "Konton"],
    ["active", "Aktiv"],
    ["suspended", "Avstängd"],
    ["guest", "Gäst"],
    ["deleted", "Raderad"],
    ["all", "Alla"],
  ]
    .map(([value, label]) => {
      const selected = value === (state ?? "") ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return adminPage(
    "Användare",
    `<main class="admin-shell admin-shell--wide">
       <h1>Användare</h1>
       <p>Listan visar konton. Gäster och raderade syns under de filtren, och där tar du bort raden själv. Sitter gästen på en resa frikopplas hen. Aktiva konton raderas inne på kontot.</p>
       ${successMessage ? successBanner(successMessage) : ""}
       ${errorMessage ? errorBanner(errorMessage) : ""}
       <p>${from}–${to} av ${total}${query ? ` · sökning “${escapeHtml(query)}”` : ""}</p>
       <form method="get" action="/admin/users" class="admin-search" role="search">
         <label for="q">Sök användare</label>
         <div class="admin-search__row">
           <input id="q" name="q" type="search" value="${escapeHtml(query)}" placeholder="Namn, e-post, inloggnings-id eller UUID">
           <select name="state" aria-label="Status">${stateOptions}</select>
           ${primaryButton("Sök")}
         </div>
       </form>
       <div class="admin-toolbar">
         <div>${filters}</div>
         <a href="${escapeHtml(usersQuery({ q: query || undefined, state, csv: true }))}">Ladda ner CSV</a>
       </div>
       <div class="admin-table-wrap">
         <table class="admin-table">
           <thead>
             <tr><th>Namn</th><th>E-post</th><th>Status</th><th>Roll</th><th>Inloggning</th><th>Skapad</th><th>Åtgärd</th></tr>
           </thead>
           <tbody>
             ${rows || `<tr><td colspan="7">Inga användare matchar.</td></tr>`}
           </tbody>
         </table>
       </div>
       <nav class="admin-pagination" aria-label="Paginering">
         ${prev} · sida ${page} av ${pageCount} · ${next}
       </nav>
     </main>`,
    { signedIn: true, nav: "users" },
  );
}

export function supportSearchPage(
  search: SupportSearchResult,
  options: { errorMessage?: string; successMessage?: string } = {},
): string {
  const waitlistRows = search.waitlist
    .map(
      (hit) => `<tr>
        <td><a href="/admin/signups/${escapeHtml(hit.id)}">${escapeHtml(hit.name)}</a>
          <div class="muted">${escapeHtml(hit.email)}</div></td>
        <td>Waitlist</td>
        <td><span class="status status--${escapeHtml(hit.status)}">${escapeHtml(STATUS_LABELS[hit.status as InterestStatus] ?? hit.status)}</span></td>
      </tr>`,
    )
    .join("");

  const userRows = search.users
    .map((hit) => {
      const deleted = hit.accountState === "deleted";
      const name = deleted
        ? "Tidigare användare"
        : hit.displayName?.trim() || "Produktanvändare";
      const weak = hit.matchReasons.includes("display_name")
        ? ` <span class="muted">(${hit.matchReasons.map(matchReasonLabel).join(", ")})</span>`
        : ` <span class="muted">(${hit.matchReasons.map(matchReasonLabel).join(", ")})</span>`;
      return `<tr>
        <td><a href="/admin/support/users/${escapeHtml(hit.id)}">${escapeHtml(name)}</a>${weak}
          <div class="muted">${escapeHtml(hit.id)}</div></td>
        <td>Produktanvändare</td>
        <td>${escapeHtml(hit.accountState)}</td>
      </tr>`;
    })
    .join("");

  let resultBlock = "";
  if (!search.query) {
    resultBlock = `<p class="muted">Sök för att slå upp en person, eller öppna <a href="/admin/users">alla användare</a>.</p>`;
  } else if (search.waitlist.length === 0 && search.users.length === 0) {
    resultBlock = `<p>Ingen träff för “${escapeHtml(search.query)}”.</p>`;
  } else {
    const kinds = [
      search.waitlist.length > 0 ? "waitlist" : null,
      search.users.length > 0 ? "produktanvändare" : null,
    ]
      .filter(Boolean)
      .join(" och ");
    const count = search.waitlist.length + search.users.length;
    resultBlock = `<p>${count === 1 ? "En träff" : `${count} träffar`} · ${escapeHtml(kinds)}.</p>
      <table class="admin-table">
        <thead><tr><th>Träff</th><th>Källa</th><th>Status</th></tr></thead>
        <tbody>${waitlistRows}${userRows}</tbody>
      </table>`;
  }

  return adminPage(
    "Support",
    `<main class="admin-shell">
       <h1>Support</h1>
       <p>Uppslag av waitlist och produktanvändare. <a href="/admin/users">Hela användarlistan</a> går att söka, ändra och exportera.</p>
       ${options.successMessage ? successBanner(options.successMessage) : ""}
       ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
       ${searchForm(search.query)}
       ${resultBlock}
     </main>`,
    { signedIn: true, nav: "support" },
  );
}

function helpEmailStopLabel(stop: "no_journey" | "no_connected_supervisor" | null): string {
  if (stop === "no_journey") return "Ingen resa";
  if (stop === "no_connected_supervisor") return "Ingen ansluten handledare";
  return "Inget av de två första stoppen";
}

function marketingSection(view: SupportUserView): string {
  const choice = view.marketingOptIn ? "Ja" : "Nej";
  return `<section data-marketing-email>
    <h2>Nyheter</h2>
    <p>Nyheter: ${choice}</p>
    <p>Samtycke: ${view.marketingConsentAt ? escapeHtml(formatWhen(view.marketingConsentAt)) : "—"}</p>
    <p>Avslut: ${view.marketingOptOutAt ? escapeHtml(formatWhen(view.marketingOptOutAt)) : "—"}</p>
    <p class="muted">Gäller bara marknadsföring. Veckomejl och hjälpmejl är produktkommunikation och styrs inte av valet.</p>
  </section>`;
}

function helpEmailSection(view: SupportUserView): string {
  const state = view.helpEmail;
  if (!state) return "";
  const sent =
    state.sent.length === 0
      ? "<p>Inget hjälpmejl skickat.</p>"
      : `<ul>${state.sent
          .map(
            (item) =>
              `<li>${escapeHtml(helpEmailStopLabel(item.type))} skickades ${escapeHtml(formatWhen(item.sentAt))}</li>`,
          )
          .join("")}</ul>`;
  return `<section>
    <h2>Hjälpmejl</h2>
    <p>Senast aktiv: ${escapeHtml(formatLastActive(state.lastActivityAt))}</p>
    <p>Tidigt stopp: ${escapeHtml(helpEmailStopLabel(state.stop))}</p>
    ${sent}
  </section>`;
}

function loginSection(view: SupportUserView): string {
  if (view.accountState === "deleted") {
    return `<section>
      <h2>E-post och inloggning</h2>
      <p class="muted">E-post och inloggningskopplingar är borttagna med kontot.</p>
    </section>`;
  }
  const rows = view.identities
    .map((identity) => {
      const email =
        identity.email ??
        (identity.provider === "email_magic_link" && identity.providerSubject.includes("@")
          ? identity.providerSubject
          : "—");
      return `<tr>
        <td>${escapeHtml(providerLabel(identity.provider))}</td>
        <td>${escapeHtml(email)}</td>
        <td><code>${escapeHtml(identity.providerSubject)}</code></td>
      </tr>`;
    })
    .join("");
  return `<section>
    <h2>E-post och inloggning</h2>
    <p>Kontaktadress: ${escapeHtml(view.contactEmail ?? "—")}</p>
    <table class="admin-table">
      <thead><tr><th>Leverantör</th><th>E-post från inloggning</th><th>Inloggnings-id</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">Ingen inloggning kopplad.</td></tr>`}</tbody>
    </table>
  </section>`;
}

function userEditForm(view: SupportUserView): string {
  if (view.accountState === "deleted") return "";
  const options = EDITABLE_ACCOUNT_STATES.map((state) => {
    const selected = state === view.accountState ? " selected" : "";
    return `<option value="${state}"${selected}>${escapeHtml(accountStateLabel(state))}</option>`;
  }).join("");
  return `<form method="post" action="/admin/users/${escapeHtml(view.id)}" class="admin-form">
    <h2>Ändra användare</h2>
    <div>
      <label for="display_name">Visningsnamn</label>
      <input id="display_name" name="display_name" type="text" maxlength="80" value="${escapeHtml(view.displayName ?? "")}">
    </div>
    <div>
      <label for="contact_email">E-post</label>
      <input id="contact_email" name="contact_email" type="email" maxlength="120" value="${escapeHtml(view.contactEmail ?? "")}">
    </div>
    <p class="muted">Kontaktadressen kan rättas här. Inloggning sker fortfarande med Apple- eller Google-id, inte med adressen.</p>
    <div>
      <label for="account_state">Kontostatus</label>
      <select id="account_state" name="account_state">${options}</select>
    </div>
    <p class="muted">Avstängd kan inte använda appen. Radering görs längre ner och går inte att ångra.</p>
    ${primaryButton("Spara")}
  </form>`;
}

export function supportUserPage(
  view: SupportUserView,
  options: {
    errorMessage?: string;
    successMessage?: string;
    editable?: boolean;
  } = {},
): string {
  const heading = supportUserHeading(view);
  const deleted = view.accountState === "deleted";
  const journeyRows = view.journeys
    .map((journey) => {
      const roleLabel =
        journey.role === "student"
          ? deleted
            ? "Tidigare elev"
            : "Elev"
          : journey.collaboratorStatus === "removed" || deleted
            ? "Tidigare handledare"
            : "Handledare";
      return `<tr>
        <td><code>${escapeHtml(journey.journeyId)}</code></td>
        <td>${escapeHtml(roleLabel)}</td>
        <td>${escapeHtml(journey.collaboratorStatus ?? "—")}</td>
        <td>${escapeHtml(journey.journeyStatus)}</td>
        <td>${escapeHtml(journey.otherPartyLabel)}</td>
      </tr>`;
    })
    .join("");

  const waitlistNote =
    view.relatedWaitlist.length > 0
      ? `<section>
           <h2>Separat waitlist-PII</h2>
           <p>Produktanvändare och intresseanmälan är olika datakällor. GDPR här raderar inte waitlist.</p>
           <ul>
             ${view.relatedWaitlist
               .map(
                 (hit) =>
                   `<li><a href="/admin/signups/${escapeHtml(hit.id)}">${escapeHtml(hit.email)}</a> (${escapeHtml(hit.status)})</li>`,
               )
               .join("")}
           </ul>
         </section>`
      : "";

  const deleteAction = options.editable
    ? `/admin/users/${escapeHtml(view.id)}/delete-account`
    : `/admin/support/users/${escapeHtml(view.id)}/delete-account`;
  const gdprForm = deleted
    ? `<p class="muted">Kontot är redan tombstonat. Gamla produkt-sessioner kan inte återaktivera det.</p>`
    : `<form method="post" action="${deleteAction}" class="admin-form admin-form--danger">
         <h2>GDPR / kontoradering</h2>
         <p>Följer account-lifecycle: ingen <code>DELETE FROM users</code>. Elevens journey raderas. Handledarhistorik frikopplas från kontot. Waitlist orörs.</p>
         <label class="interest-choice">
           <input type="checkbox" name="confirm_irreversible" value="yes" required>
           <span>Jag förstår att operationen är irreversibel.</span>
         </label>
         <div>
           <label for="confirm_user_id">Skriv in användarens UUID för att bekräfta</label>
           <input id="confirm_user_id" name="confirm_user_id" required autocomplete="off">
         </div>
         ${primaryButton("Radera konto")}
       </form>`;

  const helpEmail = helpEmailSection(view);
  const backHref = options.editable ? "/admin/users" : "/admin/support";
  const backLabel = options.editable ? "Alla användare" : "Support";
  return adminPage(
    heading,
    `<main class="admin-shell">
       <p><a href="${backHref}">← ${backLabel}</a></p>
       <h1>${escapeHtml(heading)}</h1>
       ${options.successMessage ? successBanner(options.successMessage) : ""}
       ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
       <p>UUID <code>${escapeHtml(view.id)}</code> · status <strong>${escapeHtml(accountStateLabel(view.accountState))}</strong></p>
       ${
         deleted
           ? ""
           : `<p>Visningsnamn: ${escapeHtml(view.displayName ?? "—")}</p>`
       }
       ${loginSection(view)}
       ${marketingSection(view)}
       ${options.editable ? userEditForm(view) : `<p><a href="/admin/users/${escapeHtml(view.id)}">Ändra användare</a></p>`}
       <section class="admin-kpis">
         ${kpi("Journeys", String(view.journeyCount))}
         ${kpi("Körpass", String(view.driveCount))}
         ${kpi("Genomförda körpass", String(view.completedDriveCount))}
         ${kpi("Canonical observationer", String(view.observationCount))}
       </section>
       <section>
         <h2>Roller per journey</h2>
         <table class="admin-table">
           <thead><tr><th>Journey</th><th>Roll</th><th>Collaborator</th><th>Journey-status</th><th>Motpart</th></tr></thead>
           <tbody>${journeyRows || `<tr><td colspan="5">Inga journeys.</td></tr>`}</tbody>
         </table>
       </section>
       ${helpEmail}
       ${waitlistNote}
       ${gdprForm}
     </main>`,
    { signedIn: true, nav: options.editable ? "users" : "support" },
  );
}

export function supportUserGonePage(options: { editable?: boolean } = {}): string {
  const backHref = options.editable ? "/admin/users" : "/admin/support";
  const backLabel = options.editable ? "Alla användare" : "Support";
  return adminPage(
    "Saknas",
    `<main class="admin-shell">${errorBanner("Användaren hittades inte")}<p><a href="${backHref}">Tillbaka till ${backLabel.toLowerCase()}</a></p></main>`,
    { signedIn: true, nav: options.editable ? "users" : "support" },
  );
}
