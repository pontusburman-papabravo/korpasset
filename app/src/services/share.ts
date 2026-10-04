import { config } from "../config.js";
import {
  recordProductEventSafe,
  type ProductEventName,
} from "./product-events.js";

/**
 * One share payload for the weekly email, the website and the app.
 * The link is anonymous: a surface code only. No name, account, journey,
 * driving stats or other personal data.
 *
 * Friends land on /tips, which routes iPhone, Android and desktop to the
 * right store. Google Play may still be closed for open testing; the page
 * keeps the waitlist path for that case.
 */

export const SHARE_SURFACES = ["app", "website", "weekly_email"] as const;
export type ShareSurface = (typeof SHARE_SURFACES)[number];

export const SHARE_PLATFORMS = ["ios", "android", "web"] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number];

export const SHARE_TITLE = "Körpasset";

export const SHARE_TEXT =
  "Jag använder Körpasset för att hålla koll på min övningskörning. Kanske något för dig också?";

export const SHARE_PATH = "/tips";

export const SHARE_REF_COOKIE = "korpasset_share_ref";
export const SHARE_REF_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export const SHARE_CLIENT_EVENTS = [
  "share_prompt_viewed",
  "share_started",
  "share_link_copied",
  "share_completed",
] as const;
export type ShareClientEvent = (typeof SHARE_CLIENT_EVENTS)[number];

const SHARE_EVENT_NAMES = [
  ...SHARE_CLIENT_EVENTS,
  "share_landing_viewed",
  "share_registration",
] as const satisfies readonly ProductEventName[];

export function isShareSurface(value: unknown): value is ShareSurface {
  return typeof value === "string" && (SHARE_SURFACES as readonly string[]).includes(value);
}

export function isSharePlatform(value: unknown): value is SharePlatform {
  return typeof value === "string" && (SHARE_PLATFORMS as readonly string[]).includes(value);
}

export function isShareClientEvent(value: unknown): value is ShareClientEvent {
  return typeof value === "string" && (SHARE_CLIENT_EVENTS as readonly string[]).includes(value);
}

export function shareRef(surface: ShareSurface): string {
  return `share_${surface}`;
}

export function surfaceFromShareRef(value: unknown): ShareSurface | null {
  if (typeof value !== "string") return null;
  const ref = value.trim();
  for (const surface of SHARE_SURFACES) {
    if (ref === shareRef(surface)) return surface;
  }
  return null;
}

export function shareUrl(surface: ShareSurface, baseUrl = config.appBaseUrl): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${SHARE_PATH}?ref=${shareRef(surface)}`;
}

/** User-Agent hint for which store to lead with. Every page still shows all paths. */
export function platformFromUserAgent(userAgent: string | undefined): SharePlatform {
  const value = userAgent ?? "";
  if (/android/i.test(value)) return "android";
  if (/iPhone|iPad|iPod/i.test(value)) return "ios";
  return "web";
}

export function sharePayloadHasPersonalData(text: string, url: string): boolean {
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(url)) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.pathname !== SHARE_PATH) return true;
  for (const key of parsed.searchParams.keys()) {
    if (key !== "ref") return true;
  }
  const ref = parsed.searchParams.get("ref");
  if (ref != null && !surfaceFromShareRef(ref)) return true;
  return false;
}

export async function recordShareEvent(input: {
  name: (typeof SHARE_EVENT_NAMES)[number];
  surface: ShareSurface | null;
  platform: SharePlatform | null;
  userId?: string | null;
  journeyId?: string | null;
  actorRole?: "student" | "supervisor" | null;
}): Promise<void> {
  await recordProductEventSafe({
    name: input.name,
    userId: input.userId ?? null,
    journeyId: input.journeyId ?? null,
    actorRole: input.actorRole ?? null,
    shareSurface: input.surface,
    clientPlatform: input.platform,
  });
}
