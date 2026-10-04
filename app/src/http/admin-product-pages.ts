import type {
  AdminProductStats,
  AreaUsageRow,
  JourneyUsageDetail,
  SkillUsageRow,
  TipsFilter,
  TipsLeaderRow,
  TipsWindow,
} from "../services/admin-product-stats.js";
import { featureLabel } from "../services/admin-product-stats.js";
import {
  DRIVE_COUNT_BUCKETS,
  STUCK_SIGNAL_LABELS,
  USAGE_STATUS_LABELS,
  formatCount,
  formatDuration,
  formatKm,
  formatLag,
  formatShare,
  type JourneyUsageStatus,
} from "../services/usage-metrics.js";
import type { JourneyWeeklyEmailRecord } from "../services/weekly-summary-mail.js";
import { escapeHtml } from "./layout.js";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));
}

function formatDay(day: string): string {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12)));
}

function kpi(label: string, value: string, hint?: string): string {
  return `<article class="admin-kpi">
    <p class="admin-kpi__label">${escapeHtml(label)}</p>
    <p class="admin-kpi__value">${escapeHtml(value)}</p>
    ${hint ? `<p class="muted">${escapeHtml(hint)}</p>` : ""}
  </article>`;
}

function countTable(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body =
    rows.length === 0
      ? `<tr><td colspan="${headers.length}">Ingen data ännu.</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
          )
          .join("");
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function textCell(value: string): string {
  return escapeHtml(value);
}

function seriesChart(
  title: string,
  points: Array<{ bucket: string; value: number }>,
  unit: "day" | "week",
): string {
  const max = Math.max(1, ...points.map((point) => point.value));
  const bars = points
    .map((point) => {
      const height = Math.round((point.value / max) * 100);
      return `<div class="admin-chart__bar" title="${escapeHtml(point.bucket)}: ${point.value}">
        <span style="height:${height}%"></span>
      </div>`;
    })
    .join("");
  const first = points[0]?.bucket;
  const last = points[points.length - 1]?.bucket;
  const grain = unit === "week" ? "vecka" : "dag";
  return `<figure class="admin-chart">
    <figcaption>${escapeHtml(title)}</figcaption>
    <div class="admin-chart__bars" role="img" aria-label="${escapeHtml(title)}">${bars}</div>
    <p class="muted">${first ? escapeHtml(formatDay(first.slice(0, 10))) : ""} – ${last ? escapeHtml(formatDay(last.slice(0, 10))) : ""} · max ${max}/${grain}</p>
  </figure>`;
}

function periodLinks(current: AdminProductStats["activity"]["period"]): string {
  const options: Array<[AdminProductStats["activity"]["period"], string]> = [
    ["7", "7 dagar"],
    ["30", "30 dagar"],
    ["90", "90 dagar"],
    ["all", "Hela perioden"],
  ];
  return `<p class="admin-usage-filter">${options
    .map(([value, label]) => {
      const currentAttr = value === current ? ' aria-current="page"' : "";
      return `<a href="/admin/statistik?period=${value}"${currentAttr}>${escapeHtml(label)}</a>`;
    })
    .join(" ")}</p>`;
}

function skillCallout(title: string, rows: SkillUsageRow[], empty: string): string {
  if (rows.length === 0) return `<h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(empty)}</p>`;
  return `<h3>${escapeHtml(title)}</h3>${countTable(
    ["Moment", "Kategori", "Tränat", "Avbockat"],
    rows.map((row) => [
      textCell(row.title),
      textCell(row.areaTitle),
      textCell(String(row.trainings)),
      textCell(String(row.checkoffs)),
    ]),
  )}`;
}

function retentionTable(
  caption: string,
  cohorts: AdminProductStats["retention"]["byFirstDrive"],
  field: "drive" | "activity",
): string {
  if (cohorts.length === 0) {
    return `<h3>${escapeHtml(caption)}</h3><p class="muted">Ingen kohort ännu.</p>`;
  }
  const headers = ["Kohort", "Storlek", "Vecka 0", "Vecka 1", "Vecka 2", "Vecka 3", "Vecka 4"];
  const rows = cohorts.map((cohort) => [
    textCell(formatDay(cohort.week.slice(0, 10))),
    textCell(String(cohort.size)),
    ...cohort[field].map((cell) =>
      textCell(cell.rate == null ? "—" : `${cell.rate} %`),
    ),
  ]);
  return `<h3>${escapeHtml(caption)}</h3>${countTable(headers, rows)}`;
}

function sortableSkillTable(skills: SkillUsageRow[]): string {
  const rows = skills
    .map((skill) => {
      const share =
        skill.studentsTrained === 0
          ? "—"
          : `${Math.round((skill.studentsCompleted / skill.studentsTrained) * 100)} %`;
      return `<tr>
        <td data-sort="${escapeHtml(skill.title)}">${escapeHtml(skill.title)}</td>
        <td data-sort="${escapeHtml(skill.areaTitle)}">${escapeHtml(skill.areaTitle)}</td>
        <td data-sort="${skill.trainings}">${skill.trainings}</td>
        <td data-sort="${skill.studentsTrained}">${skill.studentsTrained}</td>
        <td data-sort="${skill.checkoffs}">${skill.checkoffs}</td>
        <td data-sort="${skill.studentsChecked}">${skill.studentsChecked}</td>
        <td data-sort="${skill.studentsTrained === 0 ? -1 : skill.studentsCompleted / skill.studentsTrained}">${escapeHtml(share)}</td>
      </tr>`;
    })
    .join("");
  return `<div class="admin-table-wrap">
    <table class="admin-table" id="moment-stats">
      <thead>
        <tr>
          <th data-sort="text">Moment</th>
          <th data-sort="text">Kategori</th>
          <th data-sort="num">Gånger tränat</th>
          <th data-sort="num">Elever som tränat</th>
          <th data-sort="num">Gånger avbockat</th>
          <th data-sort="num">Elever som bockat av</th>
          <th data-sort="num">Tränat och hela checklistan</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="7">Inga moment i taxonomin.</td></tr>`}
      </tbody>
    </table>
  </div>
  <script>
    (function () {
      var table = document.getElementById("moment-stats");
      if (!table) return;
      var headers = table.querySelectorAll("thead th");
      Array.prototype.forEach.call(headers, function (header, index) {
        header.style.cursor = "pointer";
        header.addEventListener("click", function () {
          var tbody = table.querySelector("tbody");
          var list = Array.prototype.filter.call(tbody.querySelectorAll("tr"), function (row) {
            return row.children.length > 1;
          });
          var numeric = header.getAttribute("data-sort") === "num";
          var direction = header.getAttribute("data-dir") === "asc" ? "desc" : "asc";
          Array.prototype.forEach.call(headers, function (other) { other.removeAttribute("data-dir"); });
          header.setAttribute("data-dir", direction);
          list.sort(function (a, b) {
            var av = a.children[index].getAttribute("data-sort") || "";
            var bv = b.children[index].getAttribute("data-sort") || "";
            var cmp = numeric ? Number(av) - Number(bv) : av.localeCompare(bv, "sv");
            return direction === "asc" ? cmp : -cmp;
          });
          list.forEach(function (row) { tbody.appendChild(row); });
        });
      });
    })();
  </script>`;
}

export function productStatsSections(stats: AdminProductStats): string {
  const drives = stats.drives;
  const moments = stats.moments;
  const milestones = stats.milestones;
  const distanceHint =
    drives.drivesWithDistance === 0
      ? "Ingen körsträcka är registrerad på avslutade pass"
      : `Snitt bland ${drives.drivesWithDistance} pass med sträcka`;
  const mostTrained = stats.skills.filter((skill) => skill.trainings > 0).slice(0, 5);
  const mostChecked = [...stats.skills]
    .filter((skill) => skill.checkoffs > 0)
    .sort((a, b) => b.checkoffs - a.checkoffs || b.trainings - a.trainings)
    .slice(0, 5);
  const leastUsed = [...stats.skills]
    .sort((a, b) => a.trainings - b.trainings || a.checkoffs - b.checkoffs || a.title.localeCompare(b.title, "sv"))
    .slice(0, 5);

  return `<section>
    <h2>Användning</h2>
    <p class="muted">Konton är produktkonton som inte är raderade. Admin-inloggningen räknas inte. En aktiv resa har minst ett avslutat körpass i perioden. Perioderna är dygn i Europe/Stockholm, inklusive idag.</p>
    <div class="admin-kpis">
      ${kpi("Totalt antal konton", String(stats.accounts))}
      ${kpi("Totalt antal elever", String(stats.students), "Konton som äger en körkortsresa")}
      ${kpi("Totalt antal handledare", String(stats.supervisors), "Anslutna, inte bara inbjudna")}
      ${kpi("Totalt antal körkortsresor", String(stats.journeys))}
      ${kpi("Nya konton 7 dagar", String(stats.newAccounts7d))}
      ${kpi("Nya konton 30 dagar", String(stats.newAccounts30d))}
      ${kpi("Aktiva användare 7 dagar", String(stats.activeUsers7d), "App, körpass, bedömning eller händelse")}
      ${kpi("Aktiva användare 30 dagar", String(stats.activeUsers30d))}
      ${kpi("Aktiva körkortsresor 7 dagar", String(stats.activeJourneys7d), "Minst ett avslutat körpass")}
      ${kpi("Aktiva körkortsresor 30 dagar", String(stats.activeJourneys30d))}
    </div>
  </section>
  <section>
    <h2>Körpass</h2>
    <p class="muted">Bara avslutade pass. Ett pågående pass har inget sluttid och räknas inte. Samma pass räknas en gång även om resan har flera handledare.</p>
    <div class="admin-kpis">
      ${kpi("Totalt genomförda körpass", String(drives.total))}
      ${kpi("Körpass 7 dagar", String(drives.last7d))}
      ${kpi("Körpass 30 dagar", String(drives.last30d))}
      ${kpi("Unika elever 7 dagar", String(drives.students7d))}
      ${kpi("Unika elever 30 dagar", String(drives.students30d))}
      ${kpi("Snitt pass per aktiv elev", formatCount(drives.perActiveStudentAvg), `${drives.activeStudents} elever med minst ett pass`)}
      ${kpi("Median pass per aktiv elev", formatCount(drives.perActiveStudentMedian))}
      ${kpi("Total körtid", formatDuration(drives.durationSeconds))}
      ${kpi("Snittid per pass", formatDuration(drives.avgDurationSeconds))}
      ${kpi("Median körtid per pass", formatDuration(drives.medianDurationSeconds))}
      ${kpi("Total körsträcka", drives.drivesWithDistance === 0 ? "—" : formatKm(drives.distanceMeters), distanceHint)}
      ${kpi("Snittsträcka per pass", drives.drivesWithDistance === 0 ? "—" : formatKm(drives.avgDistanceMeters))}
    </div>
  </section>
  <section>
    <h2>Fördelning av antal körpass</h2>
    <p class="muted">En rad är en körkortsresa. 0 pass är resor som finns men inte har något avslutat pass. Konton utan resa ligger separat under Fastnat.</p>
    ${countTable(
      ["Pass", "Resor", "Andel"],
      stats.driveBuckets.map((bucket) => [
        textCell(bucketLabel(bucket.key)),
        textCell(String(bucket.count)),
        textCell(`${bucket.percent} %`),
      ]),
    )}
  </section>
  <section>
    <h2>First, second och fifth drive</h2>
    <p class="muted">Andelarna är körkortsresor. Second Drive inom 7, 14 och 30 dagar räknas från sluttiden på första passet till sluttiden på andra. Exakt på gränsen ingår.</p>
    <div class="admin-kpis">
      ${kpi("Minst 1 körpass", formatShare(milestones.atLeast1, milestones.journeys))}
      ${kpi("Minst 2 körpass", formatShare(milestones.atLeast2, milestones.journeys))}
      ${kpi("Minst 5 körpass", formatShare(milestones.atLeast5, milestones.journeys))}
      ${kpi("Minst 10 körpass", formatShare(milestones.atLeast10, milestones.journeys))}
      ${kpi("Registrering → första pass", formatLag(milestones.medianRegisterToFirstSeconds), "Median")}
      ${kpi("Första → andra pass", formatLag(milestones.medianFirstToSecondSeconds), "Median")}
      ${kpi("Andra → femte pass", formatLag(milestones.medianSecondToFifthSeconds), "Median")}
      ${kpi("Andra pass inom 7 dagar", formatShare(milestones.secondWithin7d, milestones.withFirst))}
      ${kpi("Andra pass inom 14 dagar", formatShare(milestones.secondWithin14d, milestones.withFirst))}
      ${kpi("Andra pass inom 30 dagar", formatShare(milestones.secondWithin30d, milestones.withFirst))}
      ${kpi("Andra pass totalt", formatShare(milestones.secondTotal, milestones.withFirst), "Oavsett hur lång tid det tog")}
    </div>
  </section>
  <section>
    <h2>Moment och checklistor</h2>
    <p class="muted">Tränat betyder att momentet bedömts på ett avslutat pass. Avbockat betyder ett ibockat körsteg på den bedömningen. Hela checklistan betyder att alla steg för momentet är ibockade. Samma moment på samma pass räknas en gång.</p>
    <div class="admin-kpis">
      ${kpi("Registrerade momentträningar", String(moments.trainings))}
      ${kpi("Avbockningar", String(moments.checkoffs), "Ibockade körsteg")}
      ${kpi("Unika moment som tränats", String(moments.uniqueTrained))}
      ${kpi("Unika moment med avbockning", String(moments.uniqueChecked))}
      ${kpi("Unika moment med hel checklista", String(moments.uniqueCompleted))}
      ${kpi("Snitt tränade moment per pass", formatCount(moments.avgTrainedPerDrive))}
      ${kpi("Median tränade moment per pass", formatCount(moments.medianTrainedPerDrive))}
      ${kpi("Snitt avbockningar per pass", formatCount(moments.avgCheckoffsPerDrive))}
      ${kpi("Pass med minst ett moment", formatShare(moments.drivesWithTraining, moments.completedDrives))}
      ${kpi("Pass utan moment", formatShare(moments.drivesWithoutTraining, moments.completedDrives))}
      ${kpi("Pass med minst en avbockning", formatShare(moments.drivesWithCheckoff, moments.completedDrives))}
    </div>
    ${skillCallout("Mest tränade moment", mostTrained, "Inget moment är tränat ännu.")}
    ${skillCallout("Mest avbockade moment", mostChecked, "Inget körsteg är avbockat ännu.")}
    ${skillCallout("Minst använda moment", leastUsed, "Inga moment i taxonomin.")}
    <h3>Alla moment</h3>
    <p class="muted">Klicka på en kolumnrubrik för att sortera. Sista kolumnen är andelen elever som tränat momentet och någon gång bockat av hela checklistan.</p>
    ${sortableSkillTable(stats.skills)}
  </section>
  <section>
    <h2>Kategorier</h2>
    <p class="muted">Kategorierna är taxonomins områden. Påbörjat betyder minst en bedömning i området. Slutfört betyder att alla moment som gäller resan senast är utan hjälp. Växling ingår inte för automat.</p>
    ${countTable(
      ["Kategori", "Träningar", "Avbockningar", "Elever", "Snittprogression", "Påbörjat", "Slutfört"],
      stats.areas.map((area) => areaCells(area)),
    )}
  </section>
  <section>
    <h2>Progression</h2>
    <p class="muted">Samma poäng som i appen: behöver hjälp 1, med påminnelse 2, utan hjälp 3, delat med tre poäng per moment som gäller resan. 0 % är resor utan bedömning. Ökning senaste 30 dagarna jämför poängen, inte bara den avrundade procenten.</p>
    ${countTable(
      ["Progression", "Resor", "Andel"],
      stats.progression.buckets.map((bucket) => [
        textCell(bucket.key === "0" ? "0 %" : bucket.key === "100" ? "100 %" : `${bucket.key} %`),
        textCell(String(bucket.count)),
        textCell(`${bucket.percent} %`),
      ]),
    )}
    <div class="admin-kpis">
      ${kpi("Genomsnittlig progression", stats.progression.averagePercent == null ? "—" : `${formatCount(stats.progression.averagePercent)} %`)}
      ${kpi("Median progression", stats.progression.medianPercent == null ? "—" : `${formatCount(stats.progression.medianPercent)} %`)}
      ${kpi("Förändring senaste 30 dagarna", stats.progression.averageDelta30d == null ? "—" : `${formatCount(stats.progression.averageDelta30d)} procentenheter`, "Snitt per resa")}
      ${kpi("Resor där progressionen ökat", String(stats.progression.increased30d))}
      ${kpi("Aktiva resor som stått still", String(stats.progression.stalledActive30d), `${stats.progression.active30d} resor med körpass senaste 30 dagarna, under 100 %`)}
    </div>
  </section>
  <section>
    <h2>Aktivitet över tid</h2>
    <p class="muted">Standard är 30 dagar per dygn. 90 dagar och hela perioden visas per vecka. Aktiva användare i diagrammet är personer med appöppning, körpass, bedömning eller produkt-händelse den dagen eller veckan. Äldre appöppningar än den senaste sparas inte.</p>
    ${periodLinks(stats.activity.period)}
    <div class="admin-charts">
      ${seriesChart("Nya användare", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.newUsers })), stats.activity.unit)}
      ${seriesChart("Aktiva användare", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.activeUsers })), stats.activity.unit)}
      ${seriesChart("Aktiva resor", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.activeJourneys })), stats.activity.unit)}
      ${seriesChart("Genomförda körpass", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.drives })), stats.activity.unit)}
      ${seriesChart("Körtid, minuter", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.durationMinutes })), stats.activity.unit)}
      ${seriesChart("Momentträningar", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.trainings })), stats.activity.unit)}
      ${seriesChart("Avbockningar", stats.activity.points.map((point) => ({ bucket: point.bucket, value: point.checkoffs })), stats.activity.unit)}
    </div>
  </section>
  <section>
    <h2>Retention</h2>
    <p class="muted">Primärt mått är ett nytt genomfört körpass, inte bara att appen öppnats. Vecka 0 i första-pass-kohorten är veckan då första passet avslutades, så den är 100 %. Produktaktivitet är körpass, bedömning, produkt-händelse eller senaste appöppning. Streck betyder att veckan inte har börjat. Senaste 12 kohorterna visas.</p>
    ${retentionTable("Körpass, kohort = veckan för första körpasset", stats.retention.byFirstDrive, "drive")}
    ${retentionTable("Produktaktivitet, samma kohort", stats.retention.byFirstDrive, "activity")}
    ${retentionTable("Körpass, kohort = registreringsvecka", stats.retention.byRegistration, "drive")}
    ${retentionTable("Produktaktivitet, registreringsvecka", stats.retention.byRegistration, "activity")}
  </section>
  <section>
    <h2>Handledare</h2>
    <p class="muted">Ansluten betyder en aktiv handledarkoppling. Inbjuden betyder en inbjudan som fortfarande väntar. Deltagit betyder att personen står som handledare på minst ett avslutat körpass. Borttagna kopplingar räknas inte som anslutna.</p>
    ${countTable(
      ["Anslutna handledare", "Resor", "Andel"],
      stats.supervisorStats.buckets.map((bucket) => [
        textCell(bucket.key === "3+" ? "3 eller fler" : bucket.key),
        textCell(String(bucket.count)),
        textCell(`${bucket.percent} %`),
      ]),
    )}
    <div class="admin-kpis">
      ${kpi("Resor med minst en aktiv handledare", formatShare(stats.supervisorStats.withActiveSupervisor, stats.supervisorStats.journeys))}
      ${kpi("Väntande inbjudningar", String(stats.supervisorStats.pendingInvites), `${stats.supervisorStats.journeysWithPendingInvite} resor`)}
      ${kpi("Handledare som deltagit i ett pass", String(stats.supervisorStats.participated))}
      ${kpi("Snitt pass per deltagande handledare", formatCount(stats.supervisorStats.drivesPerParticipatingAvg))}
      ${kpi("Median pass per deltagande handledare", formatCount(stats.supervisorStats.drivesPerParticipatingMedian))}
      ${kpi("Anslutna som inte kört", String(stats.supervisorStats.activeWithoutDrive))}
    </div>
  </section>
  <section>
    <h2>Fastnat</h2>
    <p class="muted">En resa kan finnas på flera rader. Lägg inte ihop raderna. ${stats.stuck.journeysWithSignal} resor har minst en av res-signalerna. Konton utan resa är en egen rad och ingår inte i den siffran. “Inget körpass senaste 7 dagarna” gäller bara resor som redan har ett avslutat pass, och 14 och 30 dagar överlappar den.</p>
    ${countTable(
      ["Signal", "Antal"],
      stats.stuck.signals.map((signal) => [
        textCell(STUCK_SIGNAL_LABELS[signal.key]),
        textCell(String(signal.count)),
      ]),
    )}
  </section>
  <section>
    <h2>Funktioner</h2>
    <p class="muted">Visar om passen används som mer än en körlogg. Händelserna är volymer som redan sparas, inte unika personer.</p>
    <div class="admin-kpis">
      ${kpi("Pass med valda moment", formatShare(stats.features.withFocus, stats.features.completedDrives))}
      ${kpi("Pass med bedömt moment", formatShare(stats.features.withTraining, stats.features.completedDrives))}
      ${kpi("Pass med avbockat steg", formatShare(stats.features.withCheckoff, stats.features.completedDrives))}
    </div>
    ${countTable(
      ["Händelse", "Antal"],
      stats.features.events.map((event) => [textCell(featureLabel(event.key)), textCell(String(event.count))]),
    )}
  </section>
  ${tipsSection(stats)}`;
}

const TIPS_FILTERS: Array<[TipsFilter, string]> = [
  ["all", "Alla som tipsat"],
  ["7d", "Tipsat senaste 7 dagar"],
  ["30d", "Tipsat senaste 30 dagar"],
  ["signup", "Minst 1 registrering från tips"],
  ["student", "Elev"],
  ["supervisor", "Handledare"],
  ["app", "App"],
  ["website", "Webb"],
  ["weekly_email", "Veckomejl"],
];

const TIPS_SURFACE_LABELS: Record<string, string> = {
  app: "App",
  website: "Webb",
  weekly_email: "Veckomejl",
};

function tipsFilterLinks(period: string, current: TipsFilter): string {
  return `<p class="admin-usage-filter" data-tips-filters>${TIPS_FILTERS.map(([value, label]) => {
    const currentAttr = value === current ? ' aria-current="page"' : "";
    return `<a href="/admin/statistik?period=${encodeURIComponent(period)}&amp;tips=${value}"${currentAttr}>${escapeHtml(label)}</a>`;
  }).join(" ")}</p>`;
}

function tipsRate(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return formatShare(part, whole);
}

function tipsRole(role: TipsLeaderRow["role"]): string {
  if (role === "student") return "Elev";
  if (role === "supervisor") return "Handledare";
  return "—";
}

function tipsSurfaces(surfaces: string[]): string {
  const order = ["app", "website", "weekly_email"];
  const labels = order
    .filter((surface) => surfaces.includes(surface))
    .map((surface) => TIPS_SURFACE_LABELS[surface] ?? surface);
  return labels.length > 0 ? labels.join(", ") : "—";
}

function tipsDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function tipsSection(stats: AdminProductStats): string {
  const windows = stats.tips.windows;
  const metric = (label: string, value: (window: TipsWindow) => string) =>
    `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value(windows.d7))}</td><td>${escapeHtml(value(windows.d30))}</td><td>${escapeHtml(value(windows.all))}</td></tr>`;
  const body =
    stats.tips.rows.length === 0
      ? `<tr><td colspan="7">Ingen har tipsat i det här urvalet.</td></tr>`
      : stats.tips.rows
          .map((row) => {
            const href = row.journeyId
              ? `/admin/statistik/resa/${row.journeyId}`
              : `/admin/users/${row.userId}`;
            const name = row.displayName?.trim() || "Namnlöst konto";
            return `<tr class="admin-tips-row">
              <td><a class="admin-tips-row__link" href="${escapeHtml(href)}">${escapeHtml(name)}</a></td>
              <td>${textCell(tipsRole(row.role))}</td>
              <td>${textCell(String(row.shares))}</td>
              <td>${textCell(String(row.visits))}</td>
              <td>${textCell(String(row.signups))}</td>
              <td>${textCell(tipsDate(row.lastShareAt))}</td>
              <td>${textCell(tipsSurfaces(row.surfaces))}</td>
            </tr>`;
          })
          .join("");
  return `<section data-tips-stats>
    <h2>Tips &amp; delningar</h2>
    <p class="muted">Delningsknappen använd räknas när någon trycker Tipsa en vän. En delning i telefonens delningsruta kan avbrytas, så knappen är inte ett bevis på att meddelandet skickades. Länken öppnad är ett besök via en personlig tipslänk. Registrering via tips är ett nytt konto. Första giltiga koden sparas i 30 dagar och är den som kopplas till kontot. En omladdning i samma webbläsarsession räknas som ett besök. Siffrorna nedan är 7 dagar, 30 dagar och totalt, oberoende av filtret.</p>
    <div class="admin-table-wrap"><table class="admin-table" data-tips-kpis>
      <thead><tr><th>Mått</th><th>7 dagar</th><th>30 dagar</th><th>Totalt</th></tr></thead>
      <tbody>
        ${metric("Unika användare som tipsat", (window) => String(window.uniqueSharers))}
        ${metric("Delningsknappen använd", (window) => String(window.shareStarts))}
        ${metric("Kopierade länkar", (window) => String(window.linksCopied))}
        ${metric("Länken öppnad", (window) => String(window.visits))}
        ${metric("Registrering via tips", (window) => String(window.signups))}
        ${metric("Konvertering besök → registrering", (window) => tipsRate(window.signups, window.visits))}
        ${metric("Andel aktiva användare som tipsat", (window) => tipsRate(window.activeSharers, window.activeUsers))}
      </tbody>
    </table></div>
    <h3>Användare som tipsar</h3>
    ${tipsFilterLinks(stats.activity.period, stats.tips.filter)}
    <div class="admin-table-wrap"><table class="admin-table" data-tips-leaderboard>
      <thead><tr><th>Användare</th><th>Roll</th><th>Delningar</th><th>Besök</th><th>Registreringar</th><th>Senast</th><th>Källa</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  </section>`;
}

function bucketLabel(key: string): string {
  if ((DRIVE_COUNT_BUCKETS as readonly string[]).includes(key)) {
    if (key === "20+") return "20 eller fler";
    if (key === "0") return "0 pass";
    if (key === "1") return "1 pass";
    if (key === "2") return "2 pass";
    return `${key} pass`;
  }
  return key;
}

function areaCells(area: AreaUsageRow): string[] {
  return [
    textCell(area.areaTitle),
    textCell(String(area.trainings)),
    textCell(String(area.checkoffs)),
    textCell(String(area.students)),
    textCell(`${area.averageProgressPercent} %`),
    textCell(formatShare(area.startedJourneys, area.journeys)),
    textCell(formatShare(area.completedJourneys, area.journeys)),
  ];
}

const WEEKLY_EMAIL_STATUS: Record<JourneyWeeklyEmailRecord["status"], string> = {
  sending: "Pågår",
  sent: "Skickat",
  failed: "Misslyckades",
};

function weeklyEmailSection(email: JourneyWeeklyEmailRecord | null): string {
  const latest = email
    ? `<p>Vecka ${escapeHtml(email.weekKey)}. ${escapeHtml(WEEKLY_EMAIL_STATUS[email.status])}. ${
        email.sentAt ? escapeHtml(formatWhen(email.sentAt)) : "—"
      }. ${escapeHtml(email.template)}.</p>`
    : `<p>Inget veckomejl är skickat för den här resan.</p>`;
  return `<section data-weekly-email>
      <h2>Veckomejl</h2>
      <p class="muted">Produktmejl till eleven på söndagar från kl 18, svensk tid, när veckan har haft aktivitet. Det skickas inte manuellt härifrån.</p>
      ${latest}
    </section>`;
}

export function journeyUsageDetailBody(
  detail: JourneyUsageDetail,
  weeklyEmail: JourneyWeeklyEmailRecord | null = null,
): string {
  const summary = detail.summary;
  const rows = detail.timeline
    .map(
      (event) => `<tr>
        <td>${escapeHtml(formatWhen(event.at))}</td>
        <td>${escapeHtml(event.label)}</td>
        <td>${escapeHtml(event.detail)}</td>
      </tr>`,
    )
    .join("");
  return `<main class="admin-shell admin-shell--wide">
      <p><a href="/admin/statistik">← Statistik</a></p>
      <h1>${escapeHtml(detail.studentName)}</h1>
      <p class="muted">Intern tidslinje för körkortsresan. ${escapeHtml(USAGE_STATUS_LABELS[summary.status as JourneyUsageStatus] ?? summary.status)}.</p>
      <div class="admin-kpis">
        ${kpi("Körpass", String(summary.drives))}
        ${kpi("Total körtid", formatDuration(summary.durationSeconds))}
        ${kpi("Snittid per pass", formatDuration(summary.avgDurationSeconds))}
        ${kpi("Senaste pass", summary.lastDriveAt ? formatWhen(summary.lastDriveAt) : "—")}
        ${kpi("Handledare", String(summary.activeSupervisors), summary.pendingInvites > 0 ? `${summary.pendingInvites} väntande inbjudningar` : "Anslutna")}
        ${kpi("Unika tränade moment", String(summary.uniqueSkills))}
        ${kpi("Avbockade steg", String(summary.checkoffs), `${summary.fullChecklists} hela checklistor`)}
        ${kpi("Progression", `${summary.progressionPercent} %`)}
      </div>
      <p><a href="/admin/users/${escapeHtml(detail.studentUserId)}">Öppna kontot</a></p>
      ${weeklyEmailSection(weeklyEmail)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>När</th><th>Händelse</th><th>Detalj</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="3">Ingen tidslinje.</td></tr>`}</tbody>
        </table>
      </div>
    </main>`;
}
