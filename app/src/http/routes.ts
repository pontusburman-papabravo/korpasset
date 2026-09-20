import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { AppError } from "../errors.js";
import {
  getSessionUserId,
  requireSessionUserId,
  setSessionCookie,
} from "../auth/session.js";
import { createInvitation, acceptInvitation, getInvitationByToken } from "../services/invitations.js";
import {
  createJourneyForStudent,
  formatAccessibleJourneyLabel,
  getJourneyById,
  listAccessibleActiveJourneys,
  listActiveSupervisors,
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
import { recommendNextFocus } from "../services/recommendations.js";
import {
  listJourneyReadiness,
  listSkillProgress,
  skillProgressLabel,
  isSkillNotApplicable,
} from "../services/progression.js";
import { recordProductEventSafe } from "../services/product-events.js";
import { getReusableSessionUserId, getUserById } from "../services/users.js";
import {
  escapeHtml,
  layout,
  primaryButton,
  errorBanner,
  invitationAlreadyUsedPage,
} from "./layout.js";
import { renderDevelopmentPage, renderJourneyHome } from "./journey-pages.js";
import { renderLandingPage } from "./landing.js";
import { oauthButtons } from "./oauth.js";

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

function renderSupervisorLiveFocusRow(
  journeyId: string,
  driveId: string,
  skill: { skillId: string; title: string },
  latest: { assessment: AssessmentLevel; note: string | null } | null,
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
    <form method="post" action="/journey/${escapeHtml(journeyId)}/drive/${escapeHtml(driveId)}/observe" class="live-observe__form">
      <input type="hidden" name="skill_id" value="${escapeHtml(skill.skillId)}">
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
): string {
  const display = ASSESSMENT_DISPLAY[assessment];
  return `<div class="rating-item rating-item--observed">
    <h3>${escapeHtml(title)}</h3>
    <p class="rating-observed">
      <span class="drive-recap-signal" aria-hidden="true">${display.signal}</span>
      <span>${escapeHtml(display.label)}</span>
    </p>
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

function onboardingForm(errorMessage?: string, name = ""): string {
  return `${errorMessage ? errorBanner(errorMessage) : ""}
         <h1>Vad heter du?</h1>
         <p class="muted">Du bjuder sedan in mamma, pappa eller den som kör med er. Flera handledare går bra.</p>
         <form method="post" action="/start" class="stack">
           <div>
             <label for="name">Namn</label>
             <input id="name" name="name" type="text" required autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(name)}">
           </div>
           ${primaryButton("Starta min körkortsresa")}
         </form>`;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request, reply) => {
    const userId = getSessionUserId(request);
    if (userId) {
      const journeys = await listAccessibleActiveJourneys(userId);
      if (journeys.length === 1) {
        return reply.redirect(`/journey/${journeys[0].id}`);
      }
      if (journeys.length > 1) {
        const choices = journeys
          .map((journey) => {
            const label = formatAccessibleJourneyLabel(journey);
            return `<a class="card journey-choice" href="/journey/${escapeHtml(journey.id)}">${escapeHtml(label)}</a>`;
          })
          .join("");
        return reply.type("text/html").send(
          layout(
            "Välj elev",
            `<h1>Välj elev</h1>
             <p>Vilken körkortsresa vill du öppna?</p>
             <div class="stack">${choices}</div>`,
          ),
        );
      }
      return reply.redirect("/onboarding");
    }

    return reply.type("text/html").send(
      renderLandingPage({ betaFilled: await countBetaWaitlist() }),
    );
  });

  app.get("/onboarding", async (request, reply) => {
    const userId = getSessionUserId(request);
    if (userId) {
      const journeys = await listAccessibleActiveJourneys(userId);
      if (journeys.length > 0) {
        return reply.redirect("/");
      }
    }
    const sessionUserId = await getReusableSessionUserId(userId);
    const user = sessionUserId ? await getUserById(sessionUserId) : null;
    reply.type("text/html").send(
      layout("Starta din körkortsresa", onboardingForm(undefined, user?.displayName ?? "")),
    );
  });

  app.post("/start", async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return reply
        .type("text/html")
        .status(400)
        .send(
          layout(
            "Starta din körkortsresa",
            onboardingForm("Ange ditt namn"),
          ),
        );
    }

    const sessionUserId = getSessionUserId(request);
    const { journey, userId } = await createJourneyForStudent(name, sessionUserId);
    setSessionCookie(reply, userId);
    return reply.redirect(`/journey/${journey.id}`);
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

  app.get("/invite/:token", async (request, reply) => {
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
    const sessionUser = sessionUserId ? await getUserById(sessionUserId) : null;
    const sessionName = sessionUser?.displayName?.trim() ?? "";

    reply.type("text/html").send(
      layout(
        "Anslut som handledare",
        `<h1>Du ska övningsköra med ${escapeHtml(invitation.studentName)}</h1>
         ${
           sessionUser && sessionName
             ? `<form method="post" action="/invite/${escapeHtml(token)}/accept" class="stack">
                  <input type="hidden" name="name" value="${escapeHtml(sessionName)}">
                  <p>Du ansluter som ${escapeHtml(sessionName)}.</p>
                  ${primaryButton("Anslut")}
                </form>`
             : `<form method="post" action="/invite/${escapeHtml(token)}/accept" class="stack">
                  <div>
                    <label for="name">Vad heter du?</label>
                    <input id="name" name="name" type="text" required autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(sessionName)}">
                  </div>
                  ${primaryButton(sessionUser ? "Anslut" : "Anslut som gäst")}
                </form>`
         }
         ${oauthButtons({
           returnTo: `/invite/${token}`,
           lead: "Fortsätt med Apple eller Google i appen, eller anslut som gäst.",
         })}`,
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
                  return `<label class="skill-option">
                    <input type="checkbox" name="skill_ids" value="${escapeHtml(skill.skillId)}"${checked}>
                    <span>${escapeHtml(skill.title)}</span>
                  </label>`;
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
             <p class="live-observe__safety">Notera hur det går när det är säkert. Kort anteckning är valfritt.</p>
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
            ${
              latest
                ? `<span class="muted"> · ${escapeHtml(ASSESSMENT_DISPLAY[latest.assessment].label)}</span>
                   ${latest.note ? `<p class="live-observe__note">${escapeHtml(latest.note)}</p>` : ""}`
                : ""
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
    const body = request.body as { skill_id?: string; assessment?: string; note?: string };

    try {
      await addLiveObservation(journeyId, driveId, observerUserId, {
        skillId: body.skill_id ?? "",
        assessment: body.assessment as AssessmentLevel,
        note: body.note,
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
            return renderReadOnlyObservedSkill(skill.title, latest.assessment, latest.note);
          }
          return `<div class="rating-item">
            <h3>${escapeHtml(skill.title)}</h3>
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
        : "<p>Handledaren bedömer valda moment. Kort anteckning är valfritt.</p>";

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
