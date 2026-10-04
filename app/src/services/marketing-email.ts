import { config } from "../config.js";

export function marketingUnsubscribeUrl(token: string): string {
  const base = config.appBaseUrl.replace(/\/$/, "");
  return `${base}/avregistrera/${encodeURIComponent(token)}`;
}

export function marketingListUnsubscribeHeaders(
  unsubscribeUrl: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function renderMarketingEmail(input: {
  heading: string;
  body: string;
  unsubscribeUrl: string;
}): string {
  return [
    input.heading.trim(),
    "",
    input.body.trim(),
    "",
    "Du får detta eftersom du har valt att få nyheter från Körpasset.",
    "Vill du inte få fler nyheter från Körpasset? Avregistrera dig här.",
    `Avregistrera dig: ${input.unsubscribeUrl}`,
    "Körpasset · Papa Bravo AB",
  ].join("\n");
}
