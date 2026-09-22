import { PRACTICE_STAGES, practiceStageLabel } from "../services/journeys.js";
import { escapeHtml, errorBanner, primaryButton } from "./layout.js";

export function onboardingChooser(): string {
  return `<h1>Hur är du med i övningskörningen?</h1>
         <p class="muted">Roll väljs inte på kontot. Det här styr bara hur du kommer in.</p>
         <div class="stack">
           <a class="card journey-choice" href="/onboarding?som=elev">
             <strong>Jag tar körkort</strong>
             <span class="muted">Skapa din körkortsresa och bjud in handledare.</span>
           </a>
           <a class="card journey-choice" href="/onboarding?som=handledare">
             <strong>Jag är handledare eller förälder</strong>
             <span class="muted">Eleven skapar resan. Du öppnar inbjudan. Flera elever går bra.</span>
           </a>
         </div>`;
}

export function supervisorOnboardingPage(): string {
  return `<h1>Du kopplas på via eleven</h1>
         <p>Körpasset tillhör den som tar körkort. Eleven skapar resan i appen och skickar en inbjudan till dig.</p>
         <ol class="plain-list">
           <li>Be eleven öppna Körpasset och fortsätta med Apple eller Google.</li>
           <li>Eleven skapar sin körkortsresa och trycker på <strong>Skapa inbjudan</strong>.</li>
           <li>Öppna länken du får — den ser ut som korpasset.se/invite/…</li>
         </ol>
         <p>Du kan följa flera elever, till exempel två barn eller partner och barn. Sambo, förälder eller syskon går lika bra som handledare.</p>
         <p class="muted">Tar du själv körkort? Då ska du skapa en egen resa.</p>
         <p><a class="btn btn-secondary" href="/onboarding?som=elev">Jag tar körkort</a></p>`;
}

export function studentOnboardingForm(
  errorMessage?: string,
  values: { name?: string; practiceStage?: string } = {},
): string {
  const stageOptions = PRACTICE_STAGES.filter((stage) => stage !== "unknown")
    .map((stage) => {
      const selected = values.practiceStage === stage ? " selected" : "";
      return `<option value="${stage}"${selected}>${escapeHtml(practiceStageLabel(stage))}</option>`;
    })
    .join("");

  return `${errorMessage ? errorBanner(errorMessage) : ""}
         <h1>Starta din körkortsresa</h1>
         <p class="muted">Bjud sedan in mamma, pappa, partner eller den som kör med er. Flera handledare går bra.</p>
         <form method="post" action="/start" class="stack">
           <div>
             <label for="name">Vad heter du?</label>
             <input id="name" name="name" type="text" required autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(values.name ?? "")}">
           </div>
           <div>
             <label for="practice_stage">Var är ni i övningskörningen?</label>
             <p class="muted field-hint" id="stage-hint">Så vi föreslår rätt sorts nästa steg. Inte ett betyg inför uppkörning.</p>
             <select id="practice_stage" name="practice_stage" class="supervisor-select" aria-describedby="stage-hint">
               <option value="">Välj…</option>
               ${stageOptions}
             </select>
           </div>
           ${primaryButton("Starta min körkortsresa")}
         </form>
         <p><a class="btn-link" href="/onboarding?som=handledare">Jag är handledare eller förälder</a></p>`;
}
