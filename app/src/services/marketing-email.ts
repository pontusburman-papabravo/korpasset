import { config } from "../config.js";

export type BroadcastKind = "marketing" | "service";

/** Shown in previews and test mail. Not stored as a real unsubscribe token. */
export const MARKETING_PREVIEW_TOKEN = "forhandsvisning-av-utskick";

export function isUsableEmail(value: string | null | undefined): value is string {
  const trimmed = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 120;
}

export function appUrl(path: string): string {
  const base = config.appBaseUrl.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function marketingUnsubscribeUrl(token: string): string {
  return appUrl(`/avregistrera/${encodeURIComponent(token)}`);
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
  test?: boolean;
}): string {
  return [
    ...(input.test
      ? ["Det här är ett testutskick. Det har inte skickats till mottagarna.", ""]
      : []),
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

export function renderServiceEmail(input: {
  heading: string;
  body: string;
  test?: boolean;
}): string {
  return [
    ...(input.test
      ? ["Det här är ett testutskick. Det har inte skickats till mottagarna.", ""]
      : []),
    input.heading.trim(),
    "",
    input.body.trim(),
    "",
    "Körpasset",
  ].join("\n");
}

export function renderBroadcastEmail(input: {
  kind: BroadcastKind;
  heading: string;
  body: string;
  unsubscribeUrl: string | null;
  test?: boolean;
}): string {
  if (input.kind === "marketing") {
    return renderMarketingEmail({
      heading: input.heading,
      body: input.body,
      unsubscribeUrl: input.unsubscribeUrl ?? marketingUnsubscribeUrl(MARKETING_PREVIEW_TOKEN),
      test: input.test,
    });
  }
  return renderServiceEmail({
    heading: input.heading,
    body: input.body,
    test: input.test,
  });
}
