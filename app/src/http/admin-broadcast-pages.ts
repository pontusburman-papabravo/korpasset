import type { EmailBroadcast } from "../services/email-broadcasts.js";
import type { BroadcastKind } from "../services/marketing-email.js";
import { escapeHtml, primaryButton, successBanner, errorBanner } from "./layout.js";
import { adminPage, formatWhen } from "./admin-pages.js";

export const BROADCAST_KIND_LABELS: Record<BroadcastKind, string> = {
  marketing: "Nyheter / marknadsföring",
  service: "Tjänsteinformation",
};

const STATUS_LABELS = {
  draft: "Utkast",
  sent: "Skickat",
} as const;

export function peopleLabel(count: number): string {
  return count === 1 ? "1 person" : `${count} personer`;
}

export function recipientLabel(count: number): string {
  return count === 1 ? "1 mottagare" : `${count} mottagare`;
}

function kindLabel(kind: string): string {
  return kind === "service" ? BROADCAST_KIND_LABELS.service : BROADCAST_KIND_LABELS.marketing;
}

export function broadcastsListPage(broadcasts: EmailBroadcast[]): string {
  const rows = broadcasts
    .map((broadcast) => {
      const when = broadcast.sentAt ?? broadcast.createdAt;
      const count = broadcast.recipientCount == null ? "—" : String(broadcast.recipientCount);
      return `<tr>
        <td>${escapeHtml(formatWhen(when))}</td>
        <td><a href="/admin/utskick/${escapeHtml(broadcast.id)}">${escapeHtml(broadcast.subject)}</a></td>
        <td>${escapeHtml(kindLabel(broadcast.kind))}</td>
        <td>${escapeHtml(count)}</td>
        <td>${escapeHtml(STATUS_LABELS[broadcast.status])}</td>
      </tr>`;
    })
    .join("");

  return adminPage(
    "Utskick",
    `<main class="admin-shell admin-shell--wide">
       <h1>Utskick</h1>
       <p>Nyheter skickas bara till personer som själva tackat ja. Tjänsteinformation är ett separat utskick.</p>
       <p><a class="btn btn-primary" href="/admin/utskick/ny">Nytt utskick</a></p>
       <div class="admin-table-wrap">
         <table class="admin-table">
           <thead>
             <tr><th>Datum</th><th>Ämne</th><th>Typ</th><th>Antal mottagare</th><th>Status</th></tr>
           </thead>
           <tbody>
             ${rows || `<tr><td colspan="5">Inga utskick ännu.</td></tr>`}
           </tbody>
         </table>
       </div>
     </main>`,
    { signedIn: true, nav: "utskick" },
  );
}

export function broadcastFormPage(options: {
  id?: string;
  kind: string;
  subject: string;
  heading: string;
  body: string;
  marketingCount: number;
  serviceCount: number;
  errorMessage?: string;
  successMessage?: string;
  previewSubject?: string;
  previewText?: string;
}): string {
  const selected = options.kind === "service" ? "service" : "marketing";
  const count = selected === "service" ? options.serviceCount : options.marketingCount;
  const action = options.id ? `/admin/utskick/${escapeHtml(options.id)}` : "/admin/utskick";
  const preview = options.previewText
    ? `<section class="broadcast-preview-wrap">
         <h2>Förhandsgranskning</h2>
         <p>Ämne: ${escapeHtml(options.previewSubject ?? "")}</p>
         <pre class="broadcast-preview">${escapeHtml(options.previewText)}</pre>
       </section>`
    : "";
  return adminPage(
    options.id ? "Utskick" : "Nytt utskick",
    `<main class="admin-shell">
       <p><a href="/admin/utskick">← Utskick</a></p>
       <h1>${options.id ? "Utskick" : "Nytt utskick"}</h1>
       ${options.successMessage ? successBanner(options.successMessage) : ""}
       ${options.errorMessage ? errorBanner(options.errorMessage) : ""}
       ${preview}
       <form method="post" action="${action}" class="admin-form">
         <div>
           <p><strong>Typ</strong></p>
           <label class="interest-choice">
             <input type="radio" name="kind" value="marketing"${selected === "marketing" ? " checked" : ""}>
             <span>Nyheter / marknadsföring</span>
           </label>
           <p class="muted">Endast personer som har tackat ja till nyheter. Det går inte att ta med avregistrerade.</p>
           <label class="interest-choice">
             <input type="radio" name="kind" value="service"${selected === "service" ? " checked" : ""}>
             <span>Tjänsteinformation</span>
           </label>
           <p class="muted">Nödvändig information om konto, säkerhet eller tjänsten. Inte nyheter, tips eller erbjudanden.</p>
         </div>
         <p id="recipient-line">Mottagare: ${escapeHtml(peopleLabel(count))}</p>
         <div>
           <label for="subject">Ämne</label>
           <input id="subject" name="subject" type="text" maxlength="200" required value="${escapeHtml(options.subject)}">
         </div>
         <div>
           <label for="heading">Rubrik</label>
           <input id="heading" name="heading" type="text" maxlength="200" required value="${escapeHtml(options.heading)}">
         </div>
         <div>
           <label for="body">Brödtext</label>
           <textarea id="body" name="body" rows="12" maxlength="20000" required>${escapeHtml(options.body)}</textarea>
         </div>
         <div class="broadcast-actions">
           <button type="submit" class="btn btn-primary" name="intent" value="save">Spara utkast</button>
           <button type="submit" class="btn btn-primary" name="intent" value="preview">Förhandsgranska</button>
           <button type="submit" class="btn btn-primary" name="intent" value="test">Skicka test till mig</button>
           <button type="submit" class="btn btn-primary" id="send-broadcast" name="intent" value="send">Skicka till ${escapeHtml(recipientLabel(count))}</button>
         </div>
       </form>
       <script>
         (function () {
           var counts = { marketing: ${options.marketingCount}, service: ${options.serviceCount} };
           var radios = document.querySelectorAll('input[name="kind"]');
           var line = document.getElementById("recipient-line");
           var button = document.getElementById("send-broadcast");
           function people(count) { return count === 1 ? "1 person" : count + " personer"; }
           function recipients(count) { return count === 1 ? "1 mottagare" : count + " mottagare"; }
           function sync() {
             var selectedKind = "marketing";
             radios.forEach(function (radio) { if (radio.checked) selectedKind = radio.value; });
             var count = counts[selectedKind] || 0;
             if (line) line.textContent = "Mottagare: " + people(count);
             if (button) button.textContent = "Skicka till " + recipients(count);
           }
           radios.forEach(function (radio) { radio.addEventListener("change", sync); });
         })();
       </script>
     </main>`,
    { signedIn: true, nav: "utskick" },
  );
}

export function broadcastSentPage(
  broadcast: EmailBroadcast,
  previewText: string,
  successMessage?: string,
): string {
  const when = broadcast.sentAt ?? broadcast.createdAt;
  const admin = broadcast.createdByAdminEmail
    ? `<p>Initierat av ${escapeHtml(broadcast.createdByAdminEmail)}</p>`
    : "";
  return adminPage(
    broadcast.subject,
    `<main class="admin-shell">
       <p><a href="/admin/utskick">← Utskick</a></p>
       ${successMessage ? successBanner(successMessage) : ""}
       <h1>${escapeHtml(broadcast.subject)}</h1>
       <p>Status: <strong>${STATUS_LABELS.sent}</strong></p>
       <p>Datum: ${escapeHtml(formatWhen(when))}</p>
       <p>Typ: ${escapeHtml(kindLabel(broadcast.kind))}</p>
       <p>Antal mottagare: ${escapeHtml(String(broadcast.recipientCount ?? 0))}</p>
       ${admin}
       <h2>Innehåll</h2>
       <pre class="broadcast-preview">${escapeHtml(previewText)}</pre>
     </main>`,
    { signedIn: true, nav: "utskick" },
  );
}

export function broadcastConfirmPage(
  broadcast: EmailBroadcast,
  count: number,
  errorMessage?: string,
): string {
  const sendBlock =
    count === 0
      ? `<p>Det finns inga mottagare. Utskicket skickas inte.</p>`
      : `<form method="post" action="/admin/utskick/${escapeHtml(broadcast.id)}/bekrafta" class="admin-form">
           ${primaryButton("Skicka")}
         </form>`;
  return adminPage(
    "Skicka utskick",
    `<main class="admin-shell">
       <p><a href="/admin/utskick/${escapeHtml(broadcast.id)}">← Tillbaka till utkastet</a></p>
       <h1>Skicka utskick</h1>
       ${errorMessage ? errorBanner(errorMessage) : ""}
       <p>Skicka detta mejl till ${escapeHtml(recipientLabel(count))}?</p>
       <p>Typ: ${escapeHtml(kindLabel(broadcast.kind))}</p>
       <p>Ämne: ${escapeHtml(broadcast.subject)}</p>
       <p>Mottagare: ${escapeHtml(peopleLabel(count))}</p>
       ${sendBlock}
       <p><a href="/admin/utskick/${escapeHtml(broadcast.id)}">Avbryt</a></p>
     </main>`,
    { signedIn: true, nav: "utskick" },
  );
}
