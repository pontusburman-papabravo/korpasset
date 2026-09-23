import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { AppError } from "../errors.js";
import {
  getSessionUserId,
  requireSessionUserId,
  setNativeAppCookie,
  setSessionCookie,
} from "../auth/session.js";
import { createInvitation, acceptInvitation, getInvitationByToken } from "../services/invitations.js";
import {
  createJourneyForStudent,
  getJourneyById,
  isPracticeStage,
  listActiveSupervisors,
  updatePracticeStage,
  updateTransmissionScope,
} from "../services/journeys.js";
import {
  requireActiveSupervisor,
  requireJourneyAccess,
} from "../services/authorization.js";
import { countBetaWaitlist } from "../services/interest.js";
import {
  createDriveWithFocus,
  endDrive,
  getActiveDrive,
  getDrive,
  getDriveFocusSkills,
  getLatestEndedDrive,
  isDriveFocusFullyObserved,
} from "../services/drives.js";
import { listSkillsForTaxonomy } from "../services/skills.js";
import {
  ASSESSMENT_DISPLAY,
  addLiveObservation,
  completeMissingDriveObservations,
  getDriveObservationRecap,
  getLatestDriveObservationsBySkill,
  getMissingDriveFocusSkillIds,
  recordRatingEventsIfFullyObserved,
  saveDriveObservations,
  type AssessmentLevel,
} from "../services/observations.js";
import { emptyFocusCopy, recommendNextFocus } from "../services/recommendations.js";
import {
  listJourneyReadiness,
  listSkillProgress,
  skillProgressLabel,
  isSkillNotApplicable,
} from "../services/progression.js";
import {
  onboardingChooser,
  studentOnboardingForm,
  supervisorOnboardingPage,
} from "./onboarding-pages.js";
import {
  daysSinceDriveBucket,
  recordProductEventSafe,
} from "../services/product-events.js";
import { config } from "../config.js";
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import {
  escapeHtml,
  layout,
  primaryButton,
  errorBanner,
  invitationAlreadyUsedPage,
  oauthContinuePanel,
} from "./layout.js";
import { renderJourneyPickerPage, signedInHome } from "./navigation.js";
import {
  renderDevelopmentPage,
  renderJourneyHome,
  renderSupervisorGuideCues,
  renderSupervisorGuideIndex,
  renderSupervisorGuideSkill,
  staleDriveNudge,
} from "./journey-pages.js";
import {
  clearHandoffCookie,
  isParentHandoffQuery,
  readJourneyCreatedSource,
  setHandoffCookie,
} from "./handoff-context.js";
import { supervisorGuideForSkillKey } from "../domain/supervisor-guide.js";
import { renderLandingPage } from "./landing.js";
import {
  coachingStepsForSkillKey,
  parseFormStringList,
} from "../domain/coaching-steps.js";

function handleError(error: unknown): { status: number; message: string } {
  if (error instanceof AppError) {
    return { status: error.statusCode, message: error.message };
  }
  console.error(error);
  return { status: 500, message: "Something went wrong" };
}

const RATING_LEVELS: AssessmentLevel[] = [
  "needs_help",
  "with_support",
  "independent",
];

function renderLiveAssessmentButton(level: AssessmentLevel): string {
  const display = ASSESSMENT_DISPLAY[level];
  return `<button
    type="submit"
    name="assessment"
    value="${level}"
    class="btn btn-secondary live-observe__choice live-observe__choice--${level}"
  >${escapeHtml(display.label)}</button>`;
}

function renderCoachingStepChecklist(options: {
  skillKey: string;
  fieldName: string;
  completedStepKeys?: string[];
  readOnly?: boolean;
}): string {
  const steps = coachingStepsForSkillKey(options.skillKey);
  if (steps.length === 0) return "";
  const done = new Set(options.completedStepKeys ?? []);
  const items = steps
    .map((step) => {
      if (options.readOnly) {
        return `<li class="coaching-steps__item${done.has(step.key) ? " coaching-steps__item--done" : ""}">
          <span aria-hidden="true">${done.has(step.key) ? "☑" : "☐"}</span>
          ${escapeHtml(step.label)}
        </li>`;
      }
      const checked = done.has(step.key) ? " checked" : "";
      return `<li class="coaching-steps__item">
        <label>
          <input type="checkbox" name="${escapeHtml(options.fieldName)}" value="${escapeHtml(step.key)}"${checked}>
          ${escapeHtml(step.label)}
        </label>
      </li>`;
    })
    .join("");
  return `<fieldset class="coaching-steps">
    <legend>Steg att öva</legend>
    <ol class="coaching-steps__list">${items}</ol>
  </fieldset>`;
}

function renderSupervisorLiveFocusRow(
  journeyId: string,
  driveId: string,
  skill: { skillId: string; skillKey: string; title: string },
  latest: {
    assessment: AssessmentLevel;
    note: string | null;
    completedStepKeys: string[];
  } | null,
): string {
  const statusHtml = latest
    ? `<p class="live-observe__status">
         <span class="live-observe__signal" aria-hidden="true">${ASSESSMENT_DISPLAY[latest.assessment].signal}</span>
         <span>${escapeHtml(ASSESSMENT_DISPLAY[latest.assessment].label)}</span>
       </p>
       ${latest.note ? `<p class="live-observe__note">${escapeHtml(latest.note)}</p>` : ""}`
    : "";

  return `<li class="live-observe__item">
    <div class="live-observe__header">
      <h2 class="live-observe__title">${escapeHtml(skill.title)}</h2>
      ${statusHtml}
    </div>
    ${renderSupervisorGuideCues(skill.skillKey)}
    <form method="post" action="/journey/${escapeHtml(journeyId)}/drive/${escapeHtml(driveId)}/observe" class="live-observe__form">
      <input type="hidden" name="skill_id" value="${escapeHtml(skill.skillId)}">
      ${renderCoachingStepChecklist({
        skillKey: skill.skillKey,
        fieldName: "completed_steps",
        completedStepKeys: latest?.completedStepKeys,
      })}
      <label for="note-${escapeHtml(skill.skillId)}">Kort anteckning <span class="muted">(valfritt)</span></label>
      <textarea id="note-${escapeHtml(skill.skillId)}" name="note" rows="2" maxlength="280" placeholder="T.ex. stannade för sent vid övergångsstället">${latest?.note ? escapeHtml(latest.note) : ""}</textarea>
      <div class="live-observe__choices">
        ${RATING_LEVELS.map((level) => renderLiveAssessmentButton(level)).join("")}
      </div>
    </form>
  </li>`;
}

function renderReadOnlyObservedSkill(
  title: string,
  assessment: AssessmentLevel,
  note?: string | null,
  skillKey?: string,
  completedStepKeys?: string[],
): string {
  const display = ASSESSMENT_DISPLAY[assessment];
  return `<div class="rating-item rating-item--observed">
    <h3>${escapeHtml(title)}</h3>
    <p class="rating-observed">
      <span class="drive-recap-signal" aria-hidden="true">${display.signal}</span>
      <span>${escapeHtml(display.label)}</span>
    </p>
    ${
      skillKey
        ? renderCoachingStepChecklist({
            skillKey,
            fieldName: "completed_steps",
            completedStepKeys,
            readOnly: true,
          })
        : ""
    }
    ${note ? `<p class="live-observe__note">${escapeHtml(note)}</p>` : ""}
  </div>`;
}

function renderRatingOption(skillId: string, level: AssessmentLevel): string {
  const display = ASSESSMENT_DISPLAY[level];
  return `<label class="rating-option rating-option--${level}">
    <input type="radio" name="assessment_${escapeHtml(skillId)}" value="${level}" required class="rating-option__input">
    <span class="rating-option__body">
      <span class="rating-option__label">${escapeHtml(display.label)}</span>
      <span class="rating-option__micro">${escapeHtml(display.microcopy)}</span>
    </span>
  </label>`;
}

function groupSkillsByArea(
  skills: Awaited<ReturnType<typeof listSkillsForTaxonomy>>,
): Map<string, { areaTitle: string; skills: typeof skills }> {
  const groups = new Map<string, { areaTitle: string; skills: typeof skills }>();
  for (const skill of skills) {
    const existing = groups.get(skill.areaKey);
    if (existing) {
      existing.skills.push(skill);
    } else {
      groups.set(skill.areaKey, {
        areaTitle: skill.areaTitle,
        skills: [skill],
      });
    }
  }
  return groups;
}

function onboardingPath(query: { som?: string }): "elev" | "handledare" | "val" {
  if (query.som === "elev") return "elev";
  if (query.som === "handledare") return "handledare";
  return "val";
}

async function recordOnboardingObservation(
  query: { som?: string; via?: string },
  userId: string | null,
): Promise<void> {
  if (isParentHandoffQuery(query)) {
    // Student opened the supervisor-sent start URL. Not "parent copied the link".
    await recordProductEventSafe({
      name: "student_handoff_started",
      userId,
      actorRole: "student",
      eventSource: "parent_handoff",
    });
    return;
  }
  const path = onboardingPath(query);
  if (path === "handledare") {
    await recordProductEventSafe({
      name: "onboarding_role_selected",
      userId,
      actorRole: "supervisor",
    });
    return;
  }
  if (path === "elev") {
    await recordProductEventSafe({
      name: "onboarding_role_selected",
      userId,
      actorRole: "student",
      eventSource: "direct",
    });
  }
}

function appLoginPage(errorMessage?: string): string {
  return layout(
    "Körpasset",
    `${errorMessage ? errorBanner(errorMessage) : ""}
     <h1>Fortsätt in i Körpasset</h1>
     ${oauthContinuePanel()}`,
  );
}

function canCreateStudentJourney(accountState: string | null | undefined): boolean {
  if (accountState === "active") return true;
  return config.allowGuestStudentOnboarding;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    return reply.type("text/html").send(
      renderLandingPage({ betaFilled: await countBetaWaitlist() }),
    );
  });

  app.get("/app", async (request, reply) => {
    setNativeAppCookie(reply);
    const sessionUserId = await getReusableSessionUserId(getSessionUserId(request));
    if (!sessionUserId) {
      return reply.type("text/html").send(appLoginPage());
    }

    const home = await signedInHome(sessionUserId);
    if (home.kind === "journey") {
      return reply.redirect(`/journey/${home.journeyId}`);
    }
    if (home.kind === "onboarding") {
      return reply.redirect("/onboarding");
    }
    return reply.type("text/html").send(
      renderJourneyPickerPage(home.journeys, sessionUserId),
    );
  });

  app.get("/onboarding", async (request, reply) => {
    const userId = getSessionUserId(request);
    if (userId) {
      const home = await signedInHome(userId);
      if (home.kind !== "onboarding") {
        return reply.redirect("/app");
      }
    }
    const query = request.query as { som?: string; via?: string };
    const path = onboardingPath(query);
    const sessionUserId = await getReusableSessionUserId(userId);
    const user = sessionUserId ? await getUserById(sessionUserId) : null;
    await recordOnboardingObservation(query, sessionUserId);
    if (isParentHandoffQuery(query)) {
      setHandoffCookie(reply);
    }
    if (path === "handledare") {
      return reply.type("text/html").send(
        layout("Anslut som handledare", supervisorOnboardingPage()),
      );
    }
    if (!canCreateStudentJourney(user?.accountState)) {
      const intro =
        path === "elev"
          ? "Du skapar elevresan efter att du fortsatt med Apple eller Google."
          : "Fortsätt med Apple eller Google. Elev skapar resan. Handledare öppnar inbjudan.";
      return reply.type("text/html").send(
        layout("Kom in i Körpasset", `<h1>Kom in i Körpasset</h1>
           ${oauthContinuePanel(intro)}
           <p><a class="btn-link" href="/onboarding?som=handledare">Jag är handledare eller förälder</a></p>`),
      );
    }
    if (path === "elev") {
      return reply.type("text/html").send(
        layout(
          "Starta din körkortsresa",
          studentOnboardingForm(undefined, { name: user?.displayName ?? "" }),
        ),
      );
    }
    reply.type("text/html").send(layout("Kom in i Körpasset", onboardingChooser()));
  });

  app.post("/start", async (request, reply) => {
    const body = request.body as { name?: string; practice_stage?: string };
    const name = body.name?.trim();
    const rawStage = body.practice_stage ?? "unknown";
    const practiceStage = isPracticeStage(rawStage) ? rawStage : "unknown";
    const sessionUserId = await getReusableSessionUserId(getSessionUserId(request));
    const user = sessionUserId ? await getUserById(sessionUserId) : null;

    if (!canCreateStudentJourney(user?.accountState)) {
      return reply.status(403).type("text/html").send(
        layout(
          "Starta din körkortsresa",
          `${errorBanner("Elevresa skapas efter Apple- eller Google-inloggning.")}
           ${oauthContinuePanel()}`,
        ),
      );
    }

    if (!name) {
      return reply
        .type("text/html")
        .status(400)
        .send(
          layout(
            "Starta din körkortsresa",
            studentOnboardingForm("Ange ditt namn", {
              name: user?.displayName ?? "",
              practiceStage,
            }),
          ),
        );
    }

    try {
      const createdSource = readJourneyCreatedSource(request);
      const { journey, userId } = await createJourneyForStudent(
        name,
        sessionUserId,
        practiceStage,
        createdSource,
      );
      setSessionCookie(reply, userId);
      clearHandoffCookie(reply);
      return reply.redirect(`/journey/${journey.id}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout(
          "Starta din körkortsresa",
          `${errorBanner(message)}
           ${status === 409 ? `<p><a class="btn btn-secondary" href="/app">Till Körpasset</a></p>` : studentOnboardingForm(undefined, { name, practiceStage })}`,
        ),
      );
    }
  });

  app.get("/journey/:journeyId", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      const journey = await getJourneyById(journeyId);
      if (!journey) {
        return reply.status(404).send("Not found");
      }

      const supervisors = await listActiveSupervisors(journeyId);
      const activeDrive = await getActiveDrive(journeyId);
      const latestEnded = await getLatestEndedDrive(journeyId);
      const pendingRating = Boolean(
        latestEnded &&
          !latestEnded.rated &&
          access.role === "supervisor" &&
          latestEnded.supervisorUserId === userId,
      );
      const recommendations = await recommendNextFocus(journeyId);
      const readiness = await listJourneyReadiness(journeyId);
      const nudge = staleDriveNudge(latestEnded, activeDrive?.id ?? null);
      if (nudge.shown) {
        await recordProductEventSafe({
          name: "stale_drive_nudge_shown",
          journeyId,
          userId,
          actorRole: access.role,
          practiceStage: journey.practiceStage,
          daysSinceDriveBucket: daysSinceDriveBucket(nudge.days),
        });
      }

      reply.type("text/html").send(
        layout(
          access.role === "student"
            ? "Min körkortsresa"
            : (journey.studentName ?? "Körkortsresa"),
          renderJourneyHome({
            journey,
            access,
            supervisors,
            activeDriveId: activeDrive?.id ?? null,
            latestEnded,
            pendingRating,
            recommendations,
            areas: readiness.areas,
            readiness,
          }),
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/invitations", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);

    try {
      const invitation = await createInvitation(journeyId, userId);
      const qrDataUrl = await QRCode.toDataURL(invitation.inviteUrl, {
        margin: 1,
        width: 256,
      });

      reply.type("text/html").send(
        layout(
          "Inbjudan",
          `<h1>Bjud in handledare</h1>
           <p>Skicka till mamma, pappa, syskon eller den som kör med <strong>${escapeHtml(invitation.studentName)}</strong>. En länk per person — ni kan bjuda in fler sen.</p>
           <label for="invite-url">Länk</label>
           <input id="invite-url" class="invite-url" readonly value="${escapeHtml(invitation.inviteUrl)}" onclick="this.select()">
           <button type="button" class="btn btn-secondary" id="copy-invite">Kopiera länk</button>
           <div class="qr-wrap"><img src="${qrDataUrl}" alt="QR-kod för inbjudan"></div>
           <a class="btn btn-secondary" href="/journey/${escapeHtml(journeyId)}">Tillbaka till resan</a>
           <script>
             document.getElementById('copy-invite').addEventListener('click', async function () {
               const input = document.getElementById('invite-url');
               try {
                 await navigator.clipboard.writeText(input.value);
                 this.textContent = 'Kopierad';
               } catch (err) {
                 input.select();
               }
             });
           </script>`,
          { journeyId, role: "student" },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/transmission", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);
    const body = request.body as { transmission_scope?: string };
    const scope = body.transmission_scope;
    if (scope !== "unknown" && scope !== "manual" && scope !== "automatic_only") {
      return reply.status(400).type("text/html").send(
        layout("Fel", errorBanner("Ogiltigt val för växellåda")),
      );
    }
    try {
      await updateTransmissionScope(journeyId, userId, scope);
      return reply.redirect(`/journey/${journeyId}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/practice-stage", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);
    const body = request.body as { practice_stage?: string };
    const stage = body.practice_stage ?? "";
    if (!isPracticeStage(stage)) {
      return reply.status(400).type("text/html").send(
        layout("Fel", errorBanner("Ogiltigt val för övningsläge")),
      );
    }
    try {
      await updatePracticeStage(journeyId, userId, stage);
      return reply.redirect(`/journey/${journeyId}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/utveckling", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      const journey = await getJourneyById(journeyId);
      if (!journey) {
        return reply.status(404).send("Not found");
      }
      const progress = await listSkillProgress(journeyId);
      const readiness = await listJourneyReadiness(journeyId);
      reply.type("text/html").send(
        layout(
          "Utveckling",
          renderDevelopmentPage({
            journeyId,
            studentName: journey.studentName ?? "Körkortsresa",
            readiness,
            skills: progress.map((skill) => ({
              skillId: skill.skillId,
              skillKey: skill.skillKey,
              title: skill.title,
              areaKey: skill.areaKey,
              areaTitle: skill.areaTitle,
              label: skillProgressLabel(skill),
            })),
          }),
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/guide", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      const journey = await getJourneyById(journeyId);
      if (!journey) {
        return reply.status(404).send("Not found");
      }
      const skills = await listSkillsForTaxonomy();
      reply.type("text/html").send(
        layout(
          "Handledarguiden",
          renderSupervisorGuideIndex({
            journeyId,
            studentName: journey.studentName ?? "Körkortsresa",
            skills,
          }),
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/guide/:skillKey", async (request, reply) => {
    const { journeyId, skillKey } = request.params as {
      journeyId: string;
      skillKey: string;
    };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      if (!supervisorGuideForSkillKey(skillKey)) {
        throw new AppError("Momentet finns inte i handledarguiden", 404);
      }
      const skill = (await listSkillsForTaxonomy()).find(
        (item) => item.skillKey === skillKey,
      );
      if (!skill) {
        throw new AppError("Momentet finns inte i handledarguiden", 404);
      }
      reply.type("text/html").send(
        layout(
          skill.title,
          renderSupervisorGuideSkill({ journeyId, skill }),
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/invite/:token", async (request, reply) => {
    setNativeAppCookie(reply);
    const { token } = request.params as { token: string };
    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return reply.status(404).type("text/html").send(
        layout("Inbjudan", errorBanner("Inbjudan hittades inte")),
      );
    }

    if (invitation.status !== "pending") {
      if (invitation.status === "accepted") {
        const sessionUserId = getSessionUserId(request);
        if (
          sessionUserId &&
          (sessionUserId === invitation.acceptedByUserId ||
            sessionUserId === invitation.studentUserId)
        ) {
          return reply.redirect(`/journey/${invitation.journeyId}`);
        }
        return reply.status(410).type("text/html").send(
          invitationAlreadyUsedPage(invitation.studentName),
        );
      }
      return reply.status(410).type("text/html").send(
        layout("Inbjudan", errorBanner("Inbjudan är inte längre giltig")),
      );
    }

    if (new Date(invitation.expiresAt) <= new Date()) {
      return reply.status(410).type("text/html").send(
        layout("Inbjudan", errorBanner("Inbjudan har gått ut")),
      );
    }

    const sessionUserId = await getReusableSessionUserId(getSessionUserId(request));
    if (sessionUserId && sessionUserId === invitation.studentUserId) {
      return reply.status(403).type("text/html").send(
        layout(
          "Inbjudan",
          errorBanner("Du kan inte ansluta som handledare på din egen körkortsresa."),
        ),
      );
    }
    const sessionUser = sessionUserId ? await getUserById(sessionUserId) : null;
    const sessionName = sessionUser?.displayName?.trim() ?? "";
    const isActive = sessionUser?.accountState === "active";

    reply.type("text/html").send(
      layout(
        "Anslut som handledare",
        `<h1>Du ska övningsköra med ${escapeHtml(invitation.studentName)}</h1>
         <p>Länken är till Körpasset-appen. Den skapar inget webbkonto och ingen waitlist-anmälan.</p>
         <div id="invite-open-app" class="stack" hidden>
           <p>Öppna inbjudan i Körpasset och logga in där med Apple eller Google.</p>
           <a class="btn btn-primary" id="invite-open-app-link" href="korpasset://invite/${escapeHtml(token)}">Öppna i Körpasset</a>
         </div>
         ${
           sessionUser && sessionName
             ? `<form method="post" action="/invite/${escapeHtml(token)}/accept" class="stack">
                  <input type="hidden" name="name" value="${escapeHtml(sessionName)}">
                  <p>Du ansluter som ${escapeHtml(sessionName)}${isActive ? "." : " (gäst)."}</p>
                  ${primaryButton("Anslut")}
                </form>`
             : `<form method="post" action="/invite/${escapeHtml(token)}/accept" class="stack">
                  <div>
                    <label for="name">Vad heter du?</label>
                    <input id="name" name="name" type="text" required autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(sessionName)}">
                  </div>
                  <p class="muted">Utan Apple eller Google ansluter du som gäst på den här resan. Det är inte registrering. Senare kan du fortsätta med Apple eller Google i appen — samma person, samma historik.</p>
                  ${primaryButton("Anslut som gäst")}
                </form>`
         }`,
      ),
    );
  });

  app.post("/invite/:token/accept", async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { name?: string };
    const sessionUserId = getSessionUserId(request);
    let name = body.name?.trim() ?? "";
    if (!name && sessionUserId) {
      const user = await getUserById(sessionUserId);
      name = user?.displayName?.trim() ?? "";
    }

    if (!name) {
      return reply.status(400).type("text/html").send(
        layout("Anslut", errorBanner("Ange ditt namn")),
      );
    }

    try {
      const result = await acceptInvitation(token, name, sessionUserId);
      setSessionCookie(reply, result.userId);
      return reply.redirect(`/journey/${result.journeyId}`);
    } catch (error) {
      if (error instanceof AppError && error.code === "already_accepted") {
        const invitation = await getInvitationByToken(token);
        return reply.status(409).type("text/html").send(
          invitationAlreadyUsedPage(invitation?.studentName ?? "Eleven"),
        );
      }
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Anslut", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/drive/new", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      const activeDrive = await getActiveDrive(journeyId);
      if (activeDrive) {
        return reply.redirect(`/journey/${journeyId}/drive/${activeDrive.id}`);
      }

      const supervisors = await listActiveSupervisors(journeyId);
      const supervisorPicker =
        access.role === "student" && supervisors.length > 1
          ? `<div>
               <label for="supervisor">Vilken handledare kör med er?</label>
               <select id="supervisor" name="supervisor_user_id" required class="supervisor-select">
                 ${supervisors
                   .map(
                     (s) =>
                       `<option value="${escapeHtml(s.userId)}">${escapeHtml(s.displayName ?? "Handledare")}</option>`,
                   )
                   .join("")}
               </select>
             </div>`
          : "";

      const journey = await getJourneyById(journeyId);
      const skills = (await listSkillsForTaxonomy()).filter(
        (skill) => !isSkillNotApplicable(skill.skillKey, access.transmissionScope),
      );
      const recommendedIds = new Set(
        (await recommendNextFocus(journeyId)).map((rec) => rec.skillId),
      );
      const groups = groupSkillsByArea(skills);
      const preselectedCount = skills.filter((skill) =>
        recommendedIds.has(skill.skillId),
      ).length;

      const areaHtml = [...groups.values()]
        .map(
          (group) => `<section class="skill-area">
            <h3>${escapeHtml(group.areaTitle)}</h3>
            <div class="skill-grid">
              ${group.skills
                .map((skill) => {
                  const checked = recommendedIds.has(skill.skillId) ? " checked" : "";
                  return `<div class="skill-option-row">
                    <label class="skill-option">
                      <input type="checkbox" name="skill_ids" value="${escapeHtml(skill.skillId)}"${checked}>
                      <span>${escapeHtml(skill.title)}</span>
                    </label>
                    <a class="skill-option__guide" href="/journey/${escapeHtml(journeyId)}/guide/${escapeHtml(skill.skillKey)}">Så tränar ni</a>
                  </div>`;
                })
                .join("")}
            </div>
          </section>`,
        )
        .join("");

      reply.type("text/html").send(
        layout(
          "Välj fokus",
          `<h1>Vad tränar ni på idag?</h1>
           <p>Välj 2–3 moment.</p>
           <p class="muted">${escapeHtml(emptyFocusCopy(journey?.practiceStage ?? "unknown"))}</p>
           <p class="focus-count" id="focus-count" aria-live="polite">${preselectedCount} av 3 valda</p>
           <form method="post" action="/journey/${escapeHtml(journeyId)}/drives" class="stack" id="focus-form">
             ${supervisorPicker}
             ${areaHtml}
             ${primaryButton("Starta körpass")}
           </form>
           <script>
             (function () {
               const form = document.getElementById('focus-form');
               const countEl = document.getElementById('focus-count');
               const checkboxes = form.querySelectorAll('input[name="skill_ids"]');

               function updateFocusSelection() {
                 const checked = form.querySelectorAll('input[name="skill_ids"]:checked');
                 const count = checked.length;
                 countEl.textContent = count + ' av 3 valda';
                 checkboxes.forEach((checkbox) => {
                   const option = checkbox.closest('.skill-option');
                   const atMax = count >= 3 && !checkbox.checked;
                   checkbox.disabled = atMax;
                   if (option) {
                     option.classList.toggle('skill-option--disabled', atMax);
                   }
                 });
               }

               checkboxes.forEach((checkbox) => {
                 checkbox.addEventListener('change', updateFocusSelection);
               });
               updateFocusSelection();

               form.addEventListener('submit', function (e) {
                 const checked = form.querySelectorAll('input[name="skill_ids"]:checked');
                 if (checked.length < 2 || checked.length > 3) {
                   e.preventDefault();
                   alert('Välj 2–3 moment.');
                 }
               });
             })();
           </script>`,
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/drives", async (request, reply) => {
    const { journeyId } = request.params as { journeyId: string };
    const userId = requireSessionUserId(request);
    const body = request.body as {
      skill_ids?: string | string[];
      supervisor_user_id?: string;
    };

    const skillIds = Array.isArray(body.skill_ids)
      ? body.skill_ids
      : body.skill_ids
        ? [body.skill_ids]
        : [];

    try {
      const { drive } = await createDriveWithFocus(
        journeyId,
        userId,
        skillIds,
        body.supervisor_user_id,
      );
      return reply.redirect(`/journey/${journeyId}/drive/${drive.id}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/drive/:driveId", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const userId = requireSessionUserId(request);

    try {
      const drive = await getDrive(journeyId, driveId, userId);
      if (!drive) {
        return reply.status(404).send("Not found");
      }

      if (drive.endedAt) {
        const access = await requireJourneyAccess(journeyId, userId);
        if (
          access.role === "supervisor" &&
          drive.supervisorUserId === userId
        ) {
          if (await isDriveFocusFullyObserved(journeyId, driveId)) {
            return reply.redirect(`/journey/${journeyId}/drive/${driveId}/done`);
          }
          return reply.redirect(`/journey/${journeyId}/drive/${driveId}/rate`);
        }
        return reply.type("text/html").send(
          layout(
            "Körpass avslutat",
            `<h1>Körpasset är klart</h1>
             <p>Handledaren kan nu bedöma valda moment.</p>
             <a class="btn btn-secondary" href="/journey/${escapeHtml(journeyId)}">Tillbaka till resan</a>`,
            { journeyId, role: access.role },
          ),
        );
      }

      const access = await requireJourneyAccess(journeyId, userId);
      const focusSkills = await getDriveFocusSkills(journeyId, driveId, userId);
      const isSupervisorOnDrive =
        access.role === "supervisor" && drive.supervisorUserId === userId;

      const canEnd =
        access.role === "student" || drive.supervisorUserId === userId;
      const endSection = canEnd
        ? `<form method="post" action="/journey/${escapeHtml(journeyId)}/drive/${escapeHtml(driveId)}/end">
             ${primaryButton("Körpasset klart")}
           </form>`
        : "";

      const latestBySkill = await getLatestDriveObservationsBySkill(journeyId, driveId);
      const latestMap = new Map(
        latestBySkill.map((obs) => [obs.skillId, obs]),
      );

      if (isSupervisorOnDrive) {
        const focusList = focusSkills
          .map((skill) =>
            renderSupervisorLiveFocusRow(
              journeyId,
              driveId,
              skill,
              latestMap.get(skill.skillId) ?? null,
            ),
          )
          .join("");

        reply.type("text/html").send(
          layout(
            "Körpass",
            `<h1>Körpass pågår</h1>
             <p class="live-observe__safety">Notera hur det går när det är säkert. Bocka av steg ni övat — bedömningen är fortfarande läget. Stegen är träningsstöd från kursplan och körprov, inte ett officiellt resultat. Kort anteckning är valfritt.</p>
             <ul class="live-observe__list">${focusList}</ul>
             ${endSection}`,
            { journeyId, role: access.role },
          ),
        );
        return;
      }

      const focusList = focusSkills
        .map((skill) => {
          const latest = latestMap.get(skill.skillId);
          return `<li>
            <strong>${escapeHtml(skill.title)}</strong>
            ${renderSupervisorGuideCues(skill.skillKey)}
            ${
              latest
                ? `<span class="muted"> · ${escapeHtml(ASSESSMENT_DISPLAY[latest.assessment].label)}</span>
                   ${renderCoachingStepChecklist({
                     skillKey: skill.skillKey,
                     fieldName: "completed_steps",
                     completedStepKeys: latest.completedStepKeys,
                     readOnly: true,
                   })}
                   ${latest.note ? `<p class="live-observe__note">${escapeHtml(latest.note)}</p>` : ""}`
                : renderCoachingStepChecklist({
                    skillKey: skill.skillKey,
                    fieldName: "completed_steps",
                    readOnly: true,
                  })
            }
          </li>`;
        })
        .join("");

      reply.type("text/html").send(
        layout(
          "Körpass",
          `<h1>Körpass pågår</h1>
           <p>Ni tränar på:</p>
           <ul class="focus-list">${focusList}</ul>
           ${endSection}`,
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/drive/:driveId/end", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const userId = requireSessionUserId(request);

    try {
      const drive = await endDrive(journeyId, driveId, userId);
      if (await isDriveFocusFullyObserved(journeyId, driveId)) {
        await recordRatingEventsIfFullyObserved(
          journeyId,
          driveId,
          drive.supervisorUserId,
        );
        if (drive.supervisorUserId === userId) {
          return reply.redirect(`/journey/${journeyId}/drive/${driveId}/done`);
        }
      } else if (drive.supervisorUserId === userId) {
        return reply.redirect(`/journey/${journeyId}/drive/${driveId}/rate`);
      }
      return reply.redirect(`/journey/${journeyId}/drive/${driveId}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/drive/:driveId/observe", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const observerUserId = requireSessionUserId(request);
    const body = request.body as {
      skill_id?: string;
      assessment?: string;
      note?: string;
      completed_steps?: string | string[];
    };

    try {
      await addLiveObservation(journeyId, driveId, observerUserId, {
        skillId: body.skill_id ?? "",
        assessment: body.assessment as AssessmentLevel,
        note: body.note,
        completedStepKeys: parseFormStringList(body.completed_steps),
      });
      return reply.redirect(`/journey/${journeyId}/drive/${driveId}`);
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/drive/:driveId/rate", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const userId = requireSessionUserId(request);

    try {
      await requireActiveSupervisor(journeyId, userId);
      const drive = await getDrive(journeyId, driveId, userId);
      if (!drive) {
        return reply.status(404).send("Not found");
      }
      if (drive.supervisorUserId !== userId) {
        throw new AppError("Only the drive supervisor can rate this drive", 403);
      }
      if (!drive.endedAt) {
        return reply.redirect(`/journey/${journeyId}/drive/${driveId}`);
      }
      if (await isDriveFocusFullyObserved(journeyId, driveId)) {
        return reply.redirect(`/journey/${journeyId}/drive/${driveId}/done`);
      }

      const focusSkills = await getDriveFocusSkills(journeyId, driveId, userId);
      const latestBySkill = await getLatestDriveObservationsBySkill(journeyId, driveId);
      const latestMap = new Map(latestBySkill.map((obs) => [obs.skillId, obs]));
      const missingSkillIds = await getMissingDriveFocusSkillIds(journeyId, driveId);
      const missingSet = new Set(missingSkillIds);
      const hasPartialObservations = latestBySkill.length > 0;

      const ratingItems = focusSkills
        .map((skill) => {
          const latest = latestMap.get(skill.skillId);
          if (latest && !missingSet.has(skill.skillId)) {
            return renderReadOnlyObservedSkill(
              skill.title,
              latest.assessment,
              latest.note,
              skill.skillKey,
              latest.completedStepKeys,
            );
          }
          return `<div class="rating-item">
            <h3>${escapeHtml(skill.title)}</h3>
            ${renderCoachingStepChecklist({
              skillKey: skill.skillKey,
              fieldName: `completed_steps_${skill.skillId}`,
            })}
            <div class="rating-buttons">
              ${RATING_LEVELS.map((level) => renderRatingOption(skill.skillId, level)).join("")}
            </div>
            <label for="note-${escapeHtml(skill.skillId)}">Kort anteckning <span class="muted">(valfritt)</span></label>
            <textarea id="note-${escapeHtml(skill.skillId)}" name="note_${escapeHtml(skill.skillId)}" rows="2" maxlength="280"></textarea>
            <input type="hidden" name="skill_ids" value="${escapeHtml(skill.skillId)}">
          </div>`;
        })
        .join("");

      const intro = hasPartialObservations
        ? "<p>Komplettera de moment som saknar bedömning.</p>"
        : "<p>Handledaren bedömer valda moment. Bocka av steg ni övat. Kort anteckning är valfritt.</p>";

      reply.type("text/html").send(
        layout(
          "Bedöm körpasset",
          `<h1>Hur gick det?</h1>
           ${intro}
           <form method="post" action="/journey/${escapeHtml(journeyId)}/drive/${escapeHtml(driveId)}/rate" class="rating-list">
             ${ratingItems}
             ${primaryButton("Spara bedömning")}
           </form>`,
          { journeyId, role: "supervisor" },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.post("/journey/:journeyId/drive/:driveId/rate", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const observerUserId = requireSessionUserId(request);

    const body = request.body as Record<string, string | string[]>;

    const skillIds = Array.isArray(body.skill_ids)
      ? body.skill_ids
      : body.skill_ids
        ? [body.skill_ids]
        : [];

    const observations = skillIds.map((skillId) => {
      const assessment = body[`assessment_${skillId}`] as AssessmentLevel;
      const note = body[`note_${skillId}`];
      return {
        skillId,
        assessment,
        note: typeof note === "string" ? note : null,
        completedStepKeys: parseFormStringList(body[`completed_steps_${skillId}`]),
      };
    });

    try {
      const missingSkillIds = await getMissingDriveFocusSkillIds(journeyId, driveId);
      const focusSkills = await getDriveFocusSkills(journeyId, driveId, observerUserId);
      const missingSet = new Set(missingSkillIds);

      if (missingSkillIds.length === focusSkills.length) {
        await saveDriveObservations(journeyId, driveId, observerUserId, observations);
      } else if (missingSkillIds.length > 0) {
        await completeMissingDriveObservations(
          journeyId,
          driveId,
          observerUserId,
          observations.filter((obs) => missingSet.has(obs.skillId)),
        );
      }
      return reply.redirect(`/journey/${journeyId}/drive/${driveId}/done`);
    } catch (error) {
      const { status, message } = handleError(error);
      if (error instanceof AppError && error.code === "already_rated") {
        return reply.redirect(`/journey/${journeyId}/drive/${driveId}/done`);
      }
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });

  app.get("/journey/:journeyId/drive/:driveId/done", async (request, reply) => {
    const { journeyId, driveId } = request.params as {
      journeyId: string;
      driveId: string;
    };
    const userId = requireSessionUserId(request);

    try {
      const access = await requireJourneyAccess(journeyId, userId);
      const recap = await getDriveObservationRecap(journeyId, driveId);
      const recommendations = await recommendNextFocus(journeyId);
      await recordProductEventSafe({
        name: "recap_viewed",
        journeyId,
        userId,
        actorRole: access.role,
      });

      const recapList = recap.length > 0
        ? `<ul class="drive-recap-list">
             ${recap
               .map((item) => {
                 const display = ASSESSMENT_DISPLAY[item.assessment];
                 return `<li class="drive-recap-item">
                   <span class="drive-recap-signal" aria-hidden="true">${display.signal}</span>
                   <span class="drive-recap-copy">
                     <span class="drive-recap-title">${escapeHtml(item.title)}</span>
                     <span class="drive-recap-label">${escapeHtml(display.label)}</span>
                     ${renderCoachingStepChecklist({
                       skillKey: item.skillKey,
                       fieldName: "completed_steps",
                       completedStepKeys: item.completedStepKeys,
                       readOnly: true,
                     })}
                     ${item.note ? `<span class="live-observe__note">${escapeHtml(item.note)}</span>` : ""}
                   </span>
                 </li>`;
               })
               .join("")}
           </ul>`
        : "";

      const recList = recommendations.length > 0
        ? `<ul class="recommendation-list">
             ${recommendations
               .map(
                 (rec) => `<li>
                   <span class="recommendation-title">${escapeHtml(rec.title)}</span>
                   <span class="recommendation-message">${escapeHtml(rec.message)}</span>
                 </li>`,
               )
               .join("")}
           </ul>`
        : `<p class="muted">Inga rekommendationer ännu.</p>`;

      reply.type("text/html").send(
        layout(
          "Körpass klart",
          `${recapList ? `<section class="drive-recap">
             <h1>Så gick det</h1>
             ${recapList}
           </section>` : ""}
           <section class="drive-next">
             <h2>Nästa gång</h2>
             ${recList}
           </section>
           <a class="btn btn-primary" href="/journey/${escapeHtml(journeyId)}">Tillbaka till resan</a>`,
          { journeyId, role: access.role },
        ),
      );
    } catch (error) {
      const { status, message } = handleError(error);
      return reply.status(status).type("text/html").send(
        layout("Fel", errorBanner(message)),
      );
    }
  });
}
