import {
  providerLabel,
  type LinkedIdentity,
} from "../services/oauth-accounts.js";
import { escapeHtml } from "./layout.js";

export function accountWhoLine(
  identities: LinkedIdentity[],
  displayName: string | null | undefined,
): string {
  return (
    identities.map((identity) => identity.email).find(Boolean) ??
    displayName?.trim() ??
    "ditt konto"
  );
}

export function accountProviderLine(identities: LinkedIdentity[]): string {
  return identities.map((identity) => providerLabel(identity.provider)).join(" · ");
}

export function renderSignedInAs(options: {
  displayName: string | null | undefined;
  identities: LinkedIdentity[];
}): string {
  const who = accountWhoLine(options.identities, options.displayName);
  const providers = accountProviderLine(options.identities);
  return `<section class="signed-in-as" aria-label="Inloggad som">
    <p class="eyebrow">Inloggad som</p>
    <p class="signed-in-as__who">${escapeHtml(who)}</p>
    ${
      providers
        ? `<p class="signed-in-as__provider">${escapeHtml(providers)}</p>`
        : ""
    }
  </section>`;
}
