import type { JourneyAccess } from "../services/authorization.js";
import type { DrivingJourney } from "../services/journeys.js";
import { transmissionLabel } from "../services/journeys.js";
import type { EndedDriveSummary } from "../services/drives.js";
import type { RecommendedSkill } from "../services/recommendations.js";
import { actorDisplayName } from "../services/actor-display.js";
import type { AreaProgress } from "../services/progression.js";
import { formatDay } from "../services/progression.js";
import { escapeHtml, primaryButton } from "./layout.js";

export function renderJourneyHome(options: {
  journey: DrivingJourney;
  access: JourneyAccess;
  supervisors: { userId: string; displayName: string | null }[];
  activeDriveId: string | null;
  latestEnded: EndedDriveSummary | null;
  pendingRating: boolean;
  recommendations: RecommendedSkill[];
  areas: AreaProgress[];
}): string {
  const { journey, access, supervisors, activeDriveId, latestEnded, pendingRating } =
    options;
  const journeyId = escapeHtml(journey.id);
  const isStudent = access.role === "student";
  const hasSupervisor = supervisors.length > 0;
  const studentName = escapeHtml(journey.studentName ?? "Körkortsresa");

  const heading = isStudent
    ? `<h1>Min körkortsresa</h1>
       <p class="muted">${studentName} · B-körkort · ${escapeHtml(transmissionLabel(journey.transmissionScope))}</p>`
    : `<h1>${studentName}</h1>
       <p class="muted">Du är handledare</p>`;

  const pendingSection =
    pendingRating && latestEnded
      ? `<section class="card card--action">
           <p class="eyebrow">Efter körpasset</p>
           <h2>Bedöm senaste körpasset</h2>
           <p>Det tar cirka 15 sekunder.</p>
           <a class="btn btn-primary" href="/journey/${journeyId}/drive/${escapeHtml(latestEnded.id)}/rate">Bedöm moment</a>
         </section>`
      : "";

  const activeSection = activeDriveId
    ? `<section class="card card--action">
         <p class="eyebrow">Nu</p>
         <h2>Körpass pågår</h2>
         <a class="btn btn-primary" href="/journey/${journeyId}/drive/${escapeHtml(activeDriveId)}">Gå till körpasset</a>
       </section>`
    : "";

  const startSection =
    hasSupervisor && !activeDriveId
      ? `<section class="card card--action">
           <p class="eyebrow">${isStudent ? "Planera" : "I bilen"}</p>
           <h2>${isStudent ? "Nästa körpass" : "Dagens fokus"}</h2>
           <p>Välj 2–3 moment att träna på idag.</p>
           <a class="btn btn-primary" href="/journey/${journeyId}/drive/new">Vad tränar ni på idag?</a>
         </section>`
      : "";

  const noSupervisor = !hasSupervisor
    ? `<section class="card">
         <p class="muted">Bjud in mamma, pappa eller den som kör med er. Flera handledare går bra.</p>
       </section>`
    : "";

  const recList =
    options.recommendations.length > 0
      ? `<ul class="recommendation-list">
           ${options.recommendations
             .map(
               (rec) => `<li>
                 <span class="recommendation-title">${escapeHtml(rec.title)}</span>
                 <span class="recommendation-message">${escapeHtml(rec.message)}</span>
               </li>`,
             )
             .join("")}
         </ul>`
      : `<p class="muted">Välj 2–3 moment som känns osäkra — även om ni redan kört länge. Efter första bedömningen blir tipsen mer träffsäkra.</p>`;

  const nextSection = `<section class="card">
    <h2>Nästa gång</h2>
    ${recList}
  </section>`;

  const latestSection = latestEnded
    ? `<section class="card">
         <h2>Senaste körpasset</h2>
         <p>${escapeHtml(formatDay(latestEnded.endedAt) ?? "")} med ${escapeHtml(latestEnded.supervisorLabel)}</p>
         ${
           latestEnded.rated
             ? `<a class="btn btn-secondary" href="/journey/${journeyId}/drive/${escapeHtml(latestEnded.id)}/done">Så gick det</a>`
             : pendingRating
               ? ""
               : `<p class="muted">Väntar på bedömning från ${escapeHtml(latestEnded.supervisorLabel)}.</p>`
         }
       </section>`
    : "";

  const areaRows = options.areas
    .map((area) => {
      const last = formatDay(area.lastTrainedAt);
      return `<a class="progress-row" href="/journey/${journeyId}/utveckling#${escapeHtml(area.areaKey)}">
        <span class="progress-row__title">${escapeHtml(area.areaTitle)}</span>
        <span class="progress-row__meta">${area.trainedCount} av ${area.skillCount} moment tränade${
          area.independentCount
            ? ` · ${area.independentCount} senast utan hjälp`
            : ""
        }${last ? ` · ${escapeHtml(last)}` : ""}</span>
      </a>`;
    })
    .join("");

  const developmentSection = `<section class="card">
    <h2>Utveckling</h2>
    <p class="muted">Evidens från körpassen — inte ett betyg eller en uppkörningsprocent.</p>
    <div class="progress-list">${areaRows}</div>
    <p><a href="/journey/${journeyId}/utveckling">Alla moment</a></p>
  </section>`;

  const supervisorList = supervisors
    .map(
      (s) =>
        `<li>${escapeHtml(actorDisplayName(s.displayName, null, "supervisor"))}</li>`,
    )
    .join("");

  const inviteForm = isStudent
    ? `<form method="post" action="/journey/${journeyId}/invitations">
         ${primaryButton(hasSupervisor ? "Bjud in fler handledare" : "Skapa inbjudan")}
       </form>`
    : "";

  const supervisorsSection = `<section class="card">
    <h2>${isStudent ? "Mina handledare" : "Handledare"}</h2>
    ${
      hasSupervisor
        ? `<ul class="supervisor-list">${supervisorList}</ul>
           ${isStudent ? `<p class="muted">Kör pappa, mamma eller ett syskon också? Bjud in dem så de ser samma historik.</p>` : ""}`
        : `<p class="muted">Ingen handledare ännu.</p>`
    }
    ${inviteForm}
  </section>`;

  const transmissionSection = isStudent
    ? `<section class="card">
         <h2>Växellåda</h2>
         <p class="muted">Påverkar om växling rekommenderas. Inte ett officiellt val.</p>
         <form method="post" action="/journey/${journeyId}/transmission" class="stack">
           <select name="transmission_scope" class="supervisor-select" aria-label="Växellåda">
             <option value="unknown"${journey.transmissionScope === "unknown" ? " selected" : ""}>Inte angivet</option>
             <option value="manual"${journey.transmissionScope === "manual" ? " selected" : ""}>Manuell</option>
             <option value="automatic_only"${journey.transmissionScope === "automatic_only" ? " selected" : ""}>Automat</option>
           </select>
           ${primaryButton("Spara")}
         </form>
       </section>`
    : "";

  return `${heading}
    ${pendingSection}
    ${activeSection}
    ${startSection}
    ${noSupervisor}
    ${nextSection}
    ${latestSection}
    ${developmentSection}
    ${supervisorsSection}
    ${transmissionSection}`;
}

export function renderDevelopmentPage(options: {
  journeyId: string;
  studentName: string;
  skills: {
    skillId: string;
    title: string;
    areaKey: string;
    areaTitle: string;
    label: string;
  }[];
}): string {
  const groups = new Map<string, { areaTitle: string; skills: typeof options.skills }>();
  for (const skill of options.skills) {
    const existing = groups.get(skill.areaKey);
    if (existing) existing.skills.push(skill);
    else groups.set(skill.areaKey, { areaTitle: skill.areaTitle, skills: [skill] });
  }

  const areas = [...groups.entries()]
    .map(
      ([areaKey, group]) => `<section class="skill-area" id="${escapeHtml(areaKey)}">
        <h2>${escapeHtml(group.areaTitle)}</h2>
        <ul class="development-list">
          ${group.skills
            .map(
              (skill) => `<li>
                <span class="development-title">${escapeHtml(skill.title)}</span>
                <span class="development-label">${escapeHtml(skill.label)}</span>
              </li>`,
            )
            .join("")}
        </ul>
      </section>`,
    )
    .join("");

  return `<h1>Utveckling</h1>
    <p class="muted">${escapeHtml(options.studentName)} — vad som har tränats, inte om ni är redo för uppkörning.</p>
    ${areas}
    <p><a class="btn btn-secondary" href="/journey/${escapeHtml(options.journeyId)}">Tillbaka till resan</a></p>`;
}

export const FEEDBACK_TOPICS = [
  { value: "onboarding", label: "Komma i gång" },
  { value: "invitation", label: "Inbjudan / QR" },
  { value: "drive_focus", label: "Välja dagens fokus" },
  { value: "drive", label: "Starta eller avsluta körpass" },
  { value: "rating", label: "Bedömning efter körpass" },
  { value: "recap", label: "Så gick det / nästa gång" },
  { value: "supervisors", label: "Flera handledare" },
  { value: "technical", label: "Tekniskt problem" },
  { value: "other", label: "Annat" },
] as const;
