import type { AdminBetaStats, DayCount } from "../services/admin-stats.js";
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
import { siteFooter, siteHeader } from "./landing.js";

export type AdminNav = "overview" | "signups" | "statistik" | "support";

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
      <p>Radering tar bort waitlist-raden. Används vid begäran eller manuell retention. Detta är separat från produktanvändarens account lifecycle.</p>
      <label class="consent">
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
    })}${body}${siteFooter()}`,
    { robots: "noindex, nofollow", path: "/admin" },
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
    <p class="muted">Waitlist via e-post. Produktanvändare via UUID, ev. inloggningsidentitet, eller namn som svagt uppslag.</p>
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

export function statistikPage(stats: AdminBetaStats): string {
  const funnel = [
    ["journey_created", stats.funnel.journeyCreated],
    ["supervisor_connected", stats.funnel.supervisorConnected],
    ["första körpasset", stats.funnel.firstDrive],
    ["första rated/completed drive", stats.funnel.firstRatedCompletedDrive],
    ["second_drive_completed", stats.funnel.secondDriveCompleted],
  ] as const;

  return adminPage(
    "Statistik",
    `<main class="admin-shell">
       <h1>Statistik</h1>
       <p>Beräknat från domäntabeller i Europe/Stockholm. Ingen separat analyticsdatabas.</p>
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
     </main>`,
    { signedIn: true, nav: "statistik" },
  );
}

function matchReasonLabel(reason: string): string {
  if (reason === "uuid") return "UUID";
  if (reason === "auth_identity") return "inloggningsidentitet";
  return "namn (svagt uppslag)";
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
    resultBlock = `<p class="muted">Sök för att slå upp waitlist eller produktanvändare.</p>`;
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
       <p>Uppslag av waitlist och produktanvändare. Ingen generell användarlista.</p>
       ${options.successMessage ? successBanner(options.successMessage) : ""}
       ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
       ${searchForm(search.query)}
       ${resultBlock}
     </main>`,
    { signedIn: true, nav: "support" },
  );
}

export function supportUserPage(
  view: SupportUserView,
  options: { errorMessage?: string } = {},
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

  const gdprForm = deleted
    ? `<p class="muted">Kontot är redan tombstonat. Gamla produkt-sessioner kan inte återaktivera det.</p>`
    : `<form method="post" action="/admin/support/users/${escapeHtml(view.id)}/delete-account" class="admin-form admin-form--danger">
         <h2>GDPR / kontoradering</h2>
         <p>Följer account-lifecycle: ingen <code>DELETE FROM users</code>. Elevens journey raderas. Handledare tombstonas. Waitlist orörs.</p>
         <label class="consent">
           <input type="checkbox" name="confirm_irreversible" value="yes" required>
           <span>Jag förstår att operationen är irreversibel.</span>
         </label>
         <div>
           <label for="confirm_user_id">Skriv in användarens UUID för att bekräfta</label>
           <input id="confirm_user_id" name="confirm_user_id" required autocomplete="off">
         </div>
         ${primaryButton("Radera konto")}
       </form>`;

  return adminPage(
    heading,
    `<main class="admin-shell">
       <p><a href="/admin/support">← Support</a></p>
       <h1>${escapeHtml(heading)}</h1>
       ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
       <p>UUID <code>${escapeHtml(view.id)}</code> · account_state <strong>${escapeHtml(view.accountState)}</strong></p>
       ${
         deleted
           ? ""
           : `<p>Visningsnamn: ${escapeHtml(view.displayName ?? "—")}</p>`
       }
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
       ${waitlistNote}
       ${gdprForm}
     </main>`,
    { signedIn: true, nav: "support" },
  );
}

export function supportUserGonePage(): string {
  return adminPage(
    "Saknas",
    `<main class="admin-shell">${errorBanner("Användaren hittades inte")}<p><a href="/admin/support">Tillbaka</a></p></main>`,
    { signedIn: true, nav: "support" },
  );
}
