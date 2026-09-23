import { PRACTICE_STAGES, practiceStageLabel } from "../services/journeys.js";
import { STUDENT_HANDOFF_VIA } from "./handoff-context.js";
import { escapeHtml, errorBanner, primaryButton, publicUrl } from "./layout.js";

export const STUDENT_START_PATH = `/onboarding?som=elev&via=${STUDENT_HANDOFF_VIA}`;

export function studentStartUrl(): string {
  return publicUrl(STUDENT_START_PATH);
}

const STAGE_HINTS: Record<Exclude<(typeof PRACTICE_STAGES)[number], "unknown">, string> = {
  just_started: "Första passen, korta turer i lugn trafik.",
  building: "Har kört ett tag och vill veta nästa steg.",
  near_test: "Närmar er uppkörning. Inte ett betyg.",
};

function copyableUrlField(id: string, url: string, label: string): string {
  const fieldId = escapeHtml(id);
  return `<div>
           <label for="${fieldId}">${escapeHtml(label)}</label>
           <input id="${fieldId}" class="invite-url" readonly value="${escapeHtml(url)}" onclick="this.select()">
           <button type="button" class="btn btn-secondary" id="copy-${fieldId}">Kopiera länk</button>
           <script>
             document.getElementById(${JSON.stringify(`copy-${id}`)}).addEventListener('click', async function () {
               const input = document.getElementById(${JSON.stringify(id)});
               try {
                 await navigator.clipboard.writeText(input.value);
                 this.textContent = 'Kopierad';
               } catch (err) {
                 input.select();
               }
             });
           </script>
         </div>`;
}

export function onboardingChooser(): string {
  return `<h1>Hur är du med i övningskörningen?</h1>
         <p class="muted">Om du är förälder eller handledare: välj det. Körkortsresan tillhör den som tar körkort — inte den som hittade Körpasset.</p>
         <div class="stack">
           <a class="card journey-choice" href="/onboarding?som=elev">
             <strong>Jag tar körkort</strong>
             <span class="muted">Skapa din egen körkortsresa — inte barnets — och bjud in handledare.</span>
           </a>
           <a class="card journey-choice" href="/onboarding?som=handledare">
             <strong>Jag är handledare eller förälder</strong>
             <span class="muted">Du kan sätta igång. Eleven skapar resan. Du ansluts som handledare.</span>
           </a>
         </div>`;
}

export function supervisorOnboardingPage(): string {
  return `<h1>Få in den som tar körkort</h1>
         <p>Du kan sätta igång. Körkortsresan skapas och ägs av eleven — inte av dig.</p>
         <ol class="plain-list">
           <li>Skicka länken nedan till eleven.</li>
           <li>Eleven fortsätter med Apple eller Google och skapar sin körkortsresa.</li>
           <li>Eleven skickar en inbjudan tillbaka. Öppna den så kopplas du på som handledare.</li>
         </ol>
         ${copyableUrlField("student-start-url", studentStartUrl(), "Länk till eleven")}
         <p>Du kan följa flera elever, till exempel två barn eller partner och barn. Varje elev har en egen resa.</p>
         <p class="muted">Tar du själv körkort? Då ska du skapa en egen resa.</p>
         <p><a class="btn btn-secondary" href="/onboarding?som=elev">Jag tar körkort</a></p>`;
}

export function studentOnboardingForm(
  errorMessage?: string,
  values: { name?: string; practiceStage?: string } = {},
): string {
  const stageOptions = PRACTICE_STAGES.filter((stage) => stage !== "unknown")
    .map((stage) => {
      const checked = values.practiceStage === stage ? " checked" : "";
      return `<label class="stage-choice">
               <input type="radio" name="practice_stage" value="${stage}"${checked}>
               <span>
                 <strong>${escapeHtml(practiceStageLabel(stage))}</strong>
                 <span class="stage-choice__hint">${escapeHtml(STAGE_HINTS[stage])}</span>
               </span>
             </label>`;
    })
    .join("");

  return `${errorMessage ? errorBanner(errorMessage) : ""}
         <h1>Starta din körkortsresa</h1>
         <p class="muted">Det här skapar <strong>din</strong> körkortsresa. Om du är förälder till den som tar körkort ska du inte fylla i det här — gå tillbaka och välj handledare.</p>
         <form method="post" action="/start" class="stack">
           <div>
             <label for="name">Vad heter du?</label>
             <input id="name" name="name" type="text" required autocomplete="name" placeholder="Ditt namn" value="${escapeHtml(values.name ?? "")}">
           </div>
           <fieldset class="stage-fieldset">
             <legend>Var är ni i övningskörningen?</legend>
             <p class="muted field-hint" id="stage-hint">Precis börjat och mitt i resan är lika vanliga. Inte ett betyg inför uppkörning.</p>
             ${stageOptions}
           </fieldset>
           ${primaryButton("Starta min körkortsresa")}
         </form>
         <p><a class="btn-link" href="/onboarding?som=handledare">Jag är handledare eller förälder</a></p>`;
}
