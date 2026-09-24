import type { JourneyAccess } from "../services/authorization.js";
import type { DrivingJourney } from "../services/journeys.js";
import {
  PRACTICE_STAGES,
  practiceStageLabel,
} from "../services/journeys.js";
import type { EndedDriveSummary } from "../services/drives.js";
import type { RecommendedSkill } from "../services/recommendations.js";
import { emptyFocusCopy } from "../services/recommendations.js";
import { actorDisplayName } from "../services/actor-display.js";
import type { AreaProgress, JourneyReadiness } from "../services/progression.js";
import { STALE_DRIVE_DAYS, daysSince, formatDay, formatDaysSince } from "../services/progression.js";
import type { SkillWithDefinition } from "../services/skills.js";
import {
  SUPERVISOR_ROLE_CHAPTERS,
  supervisorGuideForSkillKey,
} from "../domain/supervisor-guide.js";
import { coachingStepsForSkillKey } from "../domain/coaching-steps.js";
import type { NextDrivePlan } from "../services/next-drive-plan.js";
import { escapeHtml, primaryButton } from "./layout.js";
import { TRANSPORTSTYRELSEN_LINKS } from "./landing.js";
import {
  journeyIdentityForRole,
  renderJourneyIdentity,
} from "./journey-identity.js";

export function renderPracticeSkillRows(
  journeyId: string,
  skills: { skillKey: string; title: string }[],
): string {
  return skills
    .map(
      (skill) => `<li class="practice-item">
        <span class="practice-item__title">${escapeHtml(skill.title)}</span>
        <a class="practice-item__guide" href="/journey/${escapeHtml(journeyId)}/guide/${escapeHtml(skill.skillKey)}">Så övar ni</a>
      </li>`,
    )
    .join("");
}

export function renderNextDrivePlanCard(options: {
  journeyId: string;
  plan: NextDrivePlan;
  editHref: string;
}): string {
  const planner = options.plan.plannedByName
    ? `<p>Planerat av ${escapeHtml(options.plan.plannedByName)}</p>`
    : "";
  return `<section class="card card--action">
    <h2>Nästa körpass</h2>
    ${planner}
    <p>${options.plan.skills.length} saker att träna</p>
    <ul class="recommendation-list">
      ${renderPracticeSkillRows(options.journeyId, options.plan.skills)}
    </ul>
    <a class="btn btn-secondary" href="${escapeHtml(options.editHref)}">Ändra plan</a>
  </section>`;
}

export function renderNextWorkspacePage(options: {
  journeyId: string;
  identityTitle: string;
  identityRole: string;
  isStudent: boolean;
  plan: NextDrivePlan | null;
  supervisors: { userId: string; displayName: string | null }[];
}): string {
  const identity = renderJourneyIdentity({
    title: options.identityTitle,
    roleLine: options.identityRole,
    role: options.isStudent ? "student" : "supervisor",
  });
  const planCta = options.isStudent ? "Planera körpass" : "Välj dagens fokus";
  const emptyBody = options.isStudent
    ? "Välj 2–3 saker ni vill träna."
    : "Välj 2–3 saker att fokusera på.";
  if (!options.plan) {
    return `${identity}
      <section class="card card--action">
        <h2>Nästa körpass</h2>
        <p>${escapeHtml(emptyBody)}</p>
        <a class="btn btn-primary" href="/journey/${escapeHtml(options.journeyId)}/drive/new">${escapeHtml(planCta)}</a>
      </section>`;
  }

  const supervisorPicker =
    options.isStudent && options.supervisors.length > 1
      ? `<div>
           <label for="supervisor">Vilken handledare kör med er?</label>
           <select id="supervisor" name="supervisor_user_id" required class="supervisor-select">
             ${options.supervisors
               .map(
                 (supervisor) =>
                   `<option value="${escapeHtml(supervisor.userId)}">${escapeHtml(supervisor.displayName ?? "Handledare")}</option>`,
               )
               .join("")}
           </select>
         </div>`
      : "";
  const hiddenSkills = options.plan.skills
    .map(
      (skill) =>
        `<input type="hidden" name="skill_ids" value="${escapeHtml(skill.skillId)}">`,
    )
    .join("");
  const startForm =
    options.supervisors.length > 0
      ? `<form method="post" action="/journey/${escapeHtml(options.journeyId)}/drives" class="stack">
           ${hiddenSkills}
           ${supervisorPicker}
           ${primaryButton("Starta körpass")}
         </form>`
      : "";

  return `${identity}
    ${renderNextDrivePlanCard({
      journeyId: options.journeyId,
      plan: options.plan,
      editHref: `/journey/${options.journeyId}/drive/new`,
    })}
    ${startForm}`;
}

export function staleDriveNudge(
  latestEnded: EndedDriveSummary | null,
  activeDriveId: string | null,
): { days: number; shown: boolean } {
  const days = latestEnded && !activeDriveId ? daysSince(latestEnded.endedAt) : 0;
  return { days, shown: days >= STALE_DRIVE_DAYS };
}

export function renderJourneyHome(options: {
  journey: DrivingJourney;
  access: JourneyAccess;
  supervisors: { userId: string; displayName: string | null }[];
  activeDriveId: string | null;
  latestEnded: EndedDriveSummary | null;
  pendingRating: boolean;
  recommendations: RecommendedSkill[];
  areas: AreaProgress[];
  readiness: JourneyReadiness;
  plan: NextDrivePlan | null;
}): string {
  const { journey, access, supervisors, activeDriveId, latestEnded, pendingRating } =
    options;
  const journeyId = escapeHtml(journey.id);
  const isStudent = access.role === "student";
  const hasSupervisor = supervisors.length > 0;
  const identity = journeyIdentityForRole(
    access.role,
    journey.studentName,
    journey.licenceType,
  );
  const heading = renderJourneyIdentity(identity);

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

  const { days: staleDays, shown: staleDrive } = staleDriveNudge(
    latestEnded,
    activeDriveId,
  );
  const firstDrive = hasSupervisor && !activeDriveId && !latestEnded;
  const beginnerStart =
    journey.practiceStage === "just_started" || journey.practiceStage === "unknown";
  let startBody = isStudent
    ? "Välj 2–3 saker ni vill träna."
    : "Välj 2–3 saker att fokusera på.";
  if (staleDrive) {
    startBody = `Det är ${formatDaysSince(staleDays)} sedan ni körde. En kort runda räcker.`;
  } else if (firstDrive && beginnerStart) {
    startBody = "Ett kort pass i lugn trafik räcker. Välj 2–3 saker att börja med.";
  }
  const planCta = isStudent ? "Planera körpass" : "Välj dagens fokus";
  const startSection = !activeDriveId
    ? options.plan
      ? renderNextDrivePlanCard({
          journeyId,
          plan: options.plan,
          editHref: `/journey/${journeyId}/drive/new`,
        })
      : `<section class="card card--action">
           <h2>Nästa körpass</h2>
           <p>${escapeHtml(startBody)}</p>
           <a class="btn btn-primary" href="/journey/${journeyId}/drive/new">${escapeHtml(planCta)}</a>
         </section>`
    : "";

  const inviteHero =
    isStudent && !hasSupervisor
      ? `<section class="card card--action">
           <p class="eyebrow">Nästa steg</p>
           <h2>Bjud in den som kör med dig</h2>
           <p>Föräldern eller handledaren som hittade Körpasset ansluter med länken. Körkortsresan tillhör dig.</p>
           <form method="post" action="/journey/${journeyId}/invitations">
             ${primaryButton("Skapa inbjudan")}
           </form>
         </section>`
      : "";

  const plannedIds = new Set(options.plan?.skills.map((skill) => skill.skillId) ?? []);
  const continueSkills = options.recommendations.filter(
    (rec) => !plannedIds.has(rec.skillId),
  );
  const recList =
    continueSkills.length > 0
      ? `<ul class="recommendation-list">
           ${continueSkills
             .map(
               (rec) => `<li class="practice-item">
                 <span class="practice-item__title">${escapeHtml(rec.title)}</span>
                 <a class="practice-item__guide" href="/journey/${journeyId}/guide/${escapeHtml(rec.skillKey)}">Så övar ni</a>
               </li>`,
             )
             .join("")}
         </ul>`
      : `<p class="muted">${escapeHtml(emptyFocusCopy(journey.practiceStage))}</p>`;

  const nextSection =
    continueSkills.length > 0 || !options.plan
      ? `<section class="card">
           <h2>Fortsätt träna på</h2>
           ${recList}
         </section>`
      : "";

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
        <span class="progress-row__head">
          <span class="progress-row__title">${escapeHtml(area.areaTitle)}</span>
          <span class="progress-row__percent">${area.readinessPercent}%</span>
        </span>
        <span class="readiness-bar" aria-hidden="true"><span style="width:${area.readinessPercent}%"></span></span>
        <span class="progress-row__meta">${area.trainedCount} av ${area.skillCount} moment tränade${
          area.independentCount
            ? ` · ${area.independentCount} senast utan hjälp`
            : ""
        }${last ? ` · ${escapeHtml(last)}` : ""}</span>
      </a>`;
    })
    .join("");

  const guideSection = `<section class="card">
    <p class="eyebrow">I bilen</p>
    <h2>Handledarguiden</h2>
    <p>Tips, frågor och steg för varje moment — så ni vet vad ni tittar efter.</p>
    <a class="btn btn-secondary" href="/journey/${journeyId}/guide">Öppna guiden</a>
  </section>`;

  const developmentSection = `<section class="card">
    <h2>Så här ligger ni till</h2>
    <div class="readiness-total">
      <div class="readiness-total__head">
        <span class="readiness-total__value">${options.readiness.percent}%</span>
        <span class="readiness-total__label">Totalt läge</span>
      </div>
      <span class="readiness-bar readiness-bar--total" aria-hidden="true"><span style="width:${options.readiness.percent}%"></span></span>
      <p class="muted">${options.readiness.trainedCount} av ${options.readiness.skillCount} moment har bedömts. Från era körpass — inte ett officiellt körkortsresultat.</p>
    </div>
    <div class="progress-list">${areaRows}</div>
    <p><a href="/journey/${journeyId}/utveckling">Alla kapitel</a></p>
  </section>`;

  const supervisorList = supervisors
    .map(
      (s) =>
        `<li>${escapeHtml(actorDisplayName(s.displayName, null, "supervisor"))}</li>`,
    )
    .join("");

  const inviteForm =
    isStudent && hasSupervisor
      ? `<form method="post" action="/journey/${journeyId}/invitations">
         ${primaryButton("Bjud in fler handledare")}
       </form>`
      : "";

  const supervisorsSection = `<section class="card">
    <h2>${isStudent ? "Mina handledare" : "Handledare"}</h2>
    ${
      hasSupervisor
        ? `<ul class="supervisor-list">${supervisorList}</ul>
           ${isStudent ? `<p class="muted">Kör pappa, mamma, partner eller ett syskon också? Bjud in dem så de ser samma historik.</p>` : ""}`
        : `<p class="muted">Ingen handledare ännu.</p>`
    }
    ${inviteForm}
  </section>`;

  const practiceOptions = PRACTICE_STAGES.map((stage) => {
    const selected = journey.practiceStage === stage ? " selected" : "";
    return `<option value="${stage}"${selected}>${escapeHtml(practiceStageLabel(stage))}</option>`;
  }).join("");

  const practiceSection = isStudent
    ? `<section class="card">
         <h2>Var ni är</h2>
         <p class="muted">Så vi föreslår rätt sorts nästa steg. Inte ett betyg inför uppkörning.</p>
         <form method="post" action="/journey/${journeyId}/practice-stage" class="stack">
           <select name="practice_stage" class="supervisor-select" aria-label="Övningsläge">
             ${practiceOptions}
           </select>
           ${primaryButton("Spara")}
         </form>
       </section>`
    : "";

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
    ${inviteHero}
    ${startSection}
    ${nextSection}
    ${guideSection}
    ${latestSection}
    ${developmentSection}
    ${supervisorsSection}
    ${practiceSection}
    ${transmissionSection}`;
}

export function renderDevelopmentPage(options: {
  journeyId: string;
  studentName: string;
  identityTitle: string;
  identityRole: string;
  readiness: JourneyReadiness;
  skills: {
    skillId: string;
    skillKey: string;
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
  const areaByKey = new Map(options.readiness.areas.map((area) => [area.areaKey, area]));

  const areas = [...groups.entries()]
    .map(([areaKey, group]) => {
      const area = areaByKey.get(areaKey);
      const percent = area?.readinessPercent ?? 0;
      return `<section class="skill-area" id="${escapeHtml(areaKey)}">
        <div class="skill-area__head">
          <h2>${escapeHtml(group.areaTitle)}</h2>
          <span class="progress-row__percent">${percent}%</span>
        </div>
        <span class="readiness-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>
        <ul class="development-list">
          ${group.skills
            .map(
              (skill) => `<li>
                <a class="development-title" href="/journey/${escapeHtml(options.journeyId)}/guide/${escapeHtml(skill.skillKey)}">${escapeHtml(skill.title)}</a>
                <span class="development-label">${escapeHtml(skill.label)}</span>
              </li>`,
            )
            .join("")}
        </ul>
      </section>`;
    })
    .join("");

  return `${renderJourneyIdentity({
      title: options.identityTitle,
      roleLine: options.identityRole,
      role: options.identityRole === "Du är handledare" ? "supervisor" : "student",
    })}
    <h2>Så här ligger ni till</h2>
    <div class="readiness-total">
      <div class="readiness-total__head">
        <span class="readiness-total__value">${options.readiness.percent}%</span>
        <span class="readiness-total__label">Totalt läge</span>
      </div>
      <span class="readiness-bar readiness-bar--total" aria-hidden="true"><span style="width:${options.readiness.percent}%"></span></span>
    </div>
    <p class="muted">${escapeHtml(options.studentName)} — läge per kapitel från era bedömningar, inte ett officiellt körkortsresultat.</p>
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
  { value: "guide", label: "Handledarguiden" },
  { value: "supervisors", label: "Flera handledare" },
  { value: "technical", label: "Tekniskt problem" },
  { value: "other", label: "Annat" },
] as const;

export function renderSupervisorGuideCues(skillKey: string): string {
  const guide = supervisorGuideForSkillKey(skillKey);
  if (!guide) return "";
  const tip = guide.coachTips[0];
  return `<div class="guide-cues">
    <p class="guide-cues__tip"><span>Tips.</span> ${escapeHtml(tip)}</p>
    <p class="guide-cues__ask"><span>Fråga.</span> ${escapeHtml(guide.discuss)}</p>
  </div>`;
}

export function renderSupervisorGuideIndex(options: {
  journeyId: string;
  studentName: string;
  skills: SkillWithDefinition[];
}): string {
  const groups = new Map<string, { areaTitle: string; skills: SkillWithDefinition[] }>();
  for (const skill of options.skills) {
    const existing = groups.get(skill.areaKey);
    if (existing) existing.skills.push(skill);
    else groups.set(skill.areaKey, { areaTitle: skill.areaTitle, skills: [skill] });
  }

  const chapters = SUPERVISOR_ROLE_CHAPTERS.map(
    (chapter) => `<section class="card guide-chapter">
      <h2>${escapeHtml(chapter.title)}</h2>
      <ul>
        ${chapter.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
      </ul>
    </section>`,
  ).join("");

  const areas = [...groups.values()]
    .map(
      (group) => `<section class="skill-area">
        <h2>${escapeHtml(group.areaTitle)}</h2>
        <ul class="guide-skill-list">
          ${group.skills
            .map(
              (skill) => `<li>
                <a href="/journey/${escapeHtml(options.journeyId)}/guide/${escapeHtml(skill.skillKey)}">${escapeHtml(skill.title)}</a>
              </li>`,
            )
            .join("")}
        </ul>
      </section>`,
    )
    .join("");

  return `<h1>Handledarguiden</h1>
    <p class="muted">${escapeHtml(options.studentName)} — så tränar ni varje moment. Tips och frågor i bilen, inte teori och inte ett officiellt körkortsresultat.</p>
    ${chapters}
    <section class="card">
      <h2>Alla moment</h2>
      <p class="muted">Samma 38 moment som i körpassen. Öppna ett och läs vad du tittar efter.</p>
      ${areas}
    </section>
    <p class="muted">Råden bygger på Transportstyrelsens vägledning för privat övningskörning. Körpasset är en fristående tjänst — inte en myndighetsbok och inte någon annans handledarbok. <a href="${escapeHtml(TRANSPORTSTYRELSEN_LINKS.planera)}" rel="noopener noreferrer" target="_blank">Planera övningskörningen</a></p>
    <p><a class="btn btn-secondary" href="/journey/${escapeHtml(options.journeyId)}">Tillbaka till resan</a></p>`;
}

export function renderSupervisorGuideSkill(options: {
  journeyId: string;
  skill: SkillWithDefinition;
}): string {
  const guide = supervisorGuideForSkillKey(options.skill.skillKey);
  const steps = coachingStepsForSkillKey(options.skill.skillKey);
  const lookFor = (guide?.lookFor ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const tips = (guide?.coachTips ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const stepItems = steps
    .map((step) => `<li>${escapeHtml(step.label)}</li>`)
    .join("");

  return `<p class="eyebrow">${escapeHtml(options.skill.areaTitle)}</p>
    <h1>${escapeHtml(options.skill.title)}</h1>
    <p>${escapeHtml(options.skill.description)}</p>
    ${
      lookFor
        ? `<section class="card">
             <h2>Att vara uppmärksam på</h2>
             <ul>${lookFor}</ul>
           </section>`
        : ""
    }
    ${
      tips
        ? `<section class="card">
             <h2>Som handledare</h2>
             <ul>${tips}</ul>
           </section>`
        : ""
    }
    ${
      guide
        ? `<section class="card">
             <h2>Fråga eleven</h2>
             <p>${escapeHtml(guide.discuss)}</p>
           </section>
           <section class="card">
             <h2>När ni tar det</h2>
             <p>${escapeHtml(guide.tryWhen)}</p>
           </section>`
        : ""
    }
    ${
      stepItems
        ? `<section class="card">
             <h2>Så övar ni</h2>
             <ol class="guide-steps">${stepItems}</ol>
           </section>`
        : ""
    }
    <p><a class="btn btn-primary" href="/journey/${escapeHtml(options.journeyId)}/drive/new">Ta med i nästa körpass</a></p>
    <p><a class="btn btn-secondary" href="/journey/${escapeHtml(options.journeyId)}/guide">Alla moment</a></p>
    <p class="muted">Träningsstöd från kursplan och körprov — inte ett officiellt resultat.</p>`;
}
