import type { SkillWithDefinition } from "../services/skills.js";
import type { AreaProgress, JourneyReadiness } from "../services/progression.js";
import { READINESS_SCORE_MAX } from "../services/progression.js";
import { emptyFocusCopy } from "../services/recommendations.js";
import type { OnboardingTrack } from "./onboarding-track.js";
import { STUDENT_ONBOARDING_PATH } from "./onboarding-track.js";
import {
  copyableUrlField,
  studentStartUrl,
} from "./onboarding-pages.js";
import {
  type JourneyIdentity,
  renderJourneyIdentity,
} from "./journey-identity.js";
import { renderDevelopmentPage } from "./journey-pages.js";
import { escapeHtml } from "./layout.js";

export function waitingIdentity(track: OnboardingTrack | null): JourneyIdentity {
  if (track === "elev") {
    return {
      title: "Min körkortsresa",
      roleLine: "Elev · B-körkort",
      role: "student",
    };
  }
  if (track === "handledare") {
    return {
      title: "Körkortsresan",
      roleLine: "Du är handledare",
      role: "supervisor",
    };
  }
  return {
    title: "Körkortsresan",
    roleLine: "Ingen resa ännu",
    role: "supervisor",
  };
}

export function emptyReadinessFromSkills(
  skills: SkillWithDefinition[],
): JourneyReadiness {
  const groups = new Map<string, { areaTitle: string; count: number }>();
  for (const skill of skills) {
    const existing = groups.get(skill.areaKey);
    if (existing) existing.count += 1;
    else groups.set(skill.areaKey, { areaTitle: skill.areaTitle, count: 1 });
  }
  const areas: AreaProgress[] = [...groups.entries()].map(([areaKey, group]) => ({
    areaKey,
    areaTitle: group.areaTitle,
    skillCount: group.count,
    trainedCount: 0,
    independentCount: 0,
    driveCount: 0,
    lastTrainedAt: null,
    scored: 0,
    max: group.count * READINESS_SCORE_MAX,
    readinessPercent: 0,
  }));
  return {
    percent: 0,
    scored: 0,
    max: skills.length * READINESS_SCORE_MAX,
    trainedCount: 0,
    skillCount: skills.length,
    areas,
  };
}

function waitingInviteCard(track: OnboardingTrack | null): string {
  if (track === "elev") {
    return `<section class="card card--action">
      <p class="eyebrow">Nästa steg</p>
      <h2>Starta din körkortsresa</h2>
      <p>Du kan titta runt nu. Körpass och bedömning kräver att du skapar resan.</p>
      <a class="btn btn-primary" href="${STUDENT_ONBOARDING_PATH}">Starta min körkortsresa</a>
    </section>`;
  }
  return `<section class="card card--action">
    <p class="eyebrow">Nästa steg</p>
    <h2>Få in den som tar körkort</h2>
    <p>Du kan titta runt i appen nu. Körpass och bedömning kommer när eleven skapat resan och bjudit in dig.</p>
    ${copyableUrlField("student-start-url", studentStartUrl(), "Länk till eleven")}
  </section>`;
}

export function renderWaitingResaPage(options: {
  track: OnboardingTrack | null;
  skills: SkillWithDefinition[];
}): string {
  const identity = waitingIdentity(options.track);
  const readiness = emptyReadinessFromSkills(options.skills);
  const areaRows = readiness.areas
    .map(
      (area) => `<a class="progress-row" href="/utveckling#${escapeHtml(area.areaKey)}">
        <span class="progress-row__head">
          <span class="progress-row__title">${escapeHtml(area.areaTitle)}</span>
          <span class="progress-row__percent">0%</span>
        </span>
        <span class="readiness-bar" aria-hidden="true"><span style="width:0%"></span></span>
        <span class="progress-row__meta">0 av ${area.skillCount} moment tränade</span>
      </a>`,
    )
    .join("");

  return `${renderJourneyIdentity(identity)}
    ${waitingInviteCard(options.track)}
    <section class="card card--action">
      <h2>Nästa körpass</h2>
      <p>När eleven är inne väljer ni 2–3 saker att träna. Ett kort pass i lugn trafik räcker i början.</p>
      <a class="btn btn-secondary" href="/nasta">Öppna Nästa</a>
    </section>
    <section class="card">
      <p class="eyebrow">I bilen</p>
      <h2>Handledarguiden</h2>
      <p>Tips, frågor och steg för varje moment — så ni vet vad ni tittar efter.</p>
      <a class="btn btn-secondary" href="/guide">Öppna guiden</a>
    </section>
    <section class="card">
      <h2>Så här ligger ni till</h2>
      <div class="readiness-total">
        <div class="readiness-total__head">
          <span class="readiness-total__value">0%</span>
          <span class="readiness-total__label">Totalt läge</span>
        </div>
        <span class="readiness-bar readiness-bar--total" aria-hidden="true"><span style="width:0%"></span></span>
        <p class="muted">0 av ${readiness.skillCount} moment har bedömts. Fylls i från era körpass — inte ett officiellt körkortsresultat.</p>
      </div>
      <div class="progress-list">${areaRows}</div>
      <p><a href="/utveckling">Alla kapitel</a></p>
    </section>
    <section class="card">
      <h2>Handledare</h2>
      <p class="muted">${
        options.track === "elev"
          ? "Ingen handledare ännu. Bjud in den som kör med dig när resan är skapad."
          : "Du är redo. Eleven bjuder in dig — och fler handledare — när resan finns."
      }</p>
    </section>`;
}

export function renderWaitingNastaPage(options: {
  track: OnboardingTrack | null;
  skills: SkillWithDefinition[];
}): string {
  const identity = waitingIdentity(options.track);
  const preview = options.skills.slice(0, 3);
  const rows = preview
    .map(
      (skill) => `<li class="practice-item">
        <span class="practice-item__title">${escapeHtml(skill.title)}</span>
        <a class="practice-item__guide" href="/guide/${escapeHtml(skill.skillKey)}">Så övar ni</a>
      </li>`,
    )
    .join("");

  return `${renderJourneyIdentity(identity)}
    <section class="card card--action">
      <h2>Nästa körpass</h2>
      <p>${emptyFocusCopy("just_started")}</p>
      <p class="muted">Själva körningen startas när eleven bjudit in dig.</p>
      ${
        rows
          ? `<ul class="recommendation-list">${rows}</ul>`
          : ""
      }
    </section>`;
}

export function renderWaitingUtvecklingPage(options: {
  track: OnboardingTrack | null;
  skills: SkillWithDefinition[];
}): string {
  const identity = waitingIdentity(options.track);
  return renderDevelopmentPage({
    journeyId: null,
    studentName: "Körkortsresan",
    identityTitle: identity.title,
    identityRole: identity.roleLine,
    readiness: emptyReadinessFromSkills(options.skills),
    skills: options.skills.map((skill) => ({
      skillId: skill.skillId,
      skillKey: skill.skillKey,
      title: skill.title,
      areaKey: skill.areaKey,
      areaTitle: skill.areaTitle,
      label: "Inte tränat ännu",
    })),
  });
}
