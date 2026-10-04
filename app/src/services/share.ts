import { randomInt } from "node:crypto";
import { config } from "../config.js";
import { getPool } from "../db/pool.js";
import { getJourneyAccess } from "./authorization.js";
import {
  recordProductEventSafe,
  type ProductEventName,
} from "./product-events.js";

/**
 * One share payload for the weekly email, the website and the app.
 * Logged-in users share a stable opaque referral code. The code is not a
 * user id, email, name or sequence number. Logged-out shares omit the code.
 *
 * Friends land on /tips. The first valid code is stored for 30 days and is
 * the one that can be attached to a new account. A later code does not
 * replace it. Opening your own link while signed in is not a referral visit.
 */

export const SHARE_SURFACES = ["app", "website", "weekly_email"] as const;
export type ShareSurface = (typeof SHARE_SURFACES)[number];

export const SHARE_PLATFORMS = ["ios", "android", "web"] as const;
export type SharePlatform = (typeof SHARE_PLATFORMS)[number];

export const SHARE_TITLE = "Körpasset";

export const SHARE_TEXT =
  "Jag använder Körpasset för att hålla koll på min övningskörning. Kanske något för dig också?";

export const SHARE_PATH = "/tips";

/** Crockford-like alphabet: no 0/O/1/I/L, so the code is not a counter. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

export const REFERRAL_COOKIE = "korpasset_referral";
export const REFERRAL_SEEN_COOKIE = "korpasset_referral_seen";
export const REFERRAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

const REFERRAL_CODE_PATTERN = new RegExp(
  `^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`,
);

export function isShareSurface(value: unknown): value is ShareSurface {
  return typeof value === "string" && (SHARE_SURFACES as readonly string[]).includes(value);
}

export function isSharePlatform(value: unknown): value is SharePlatform {
  return typeof value === "string" && (SHARE_PLATFORMS as readonly string[]).includes(value);
}

export function isShareClientEvent(value: unknown): value is ShareClientEvent {
  return typeof value === "string" && (SHARE_CLIENT_EVENTS as readonly string[]).includes(value);
}

export function isReferralCode(value: unknown): value is string {
  return typeof value === "string" && REFERRAL_CODE_PATTERN.test(value);
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

export function referralShareUrl(
  code: string | null,
  surface: ShareSurface,
  baseUrl = config.appBaseUrl,
): string {
  const base = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (code && isReferralCode(code)) params.set("r", code);
  params.set("source", surface);
  return `${base}${SHARE_PATH}?${params.toString()}`;
}

/** Anonymous share link. Logged-in links use personalShareUrl. */
export function shareUrl(surface: ShareSurface, baseUrl = config.appBaseUrl): string {
  return referralShareUrl(null, surface, baseUrl);
}

export function referralCookieValue(
  code: string,
  surface: ShareSurface,
  seenAt = new Date(),
): string {
  return `${code}.${surface}.${Math.floor(seenAt.getTime() / 1000)}`;
}

export function parseReferralCookie(
  value: unknown,
  now = new Date(),
): { code: string; surface: ShareSurface; seenAt: Date } | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})\.(app|website|weekly_email)\.(\d{10,13})$/,
  );
  if (!match) return null;
  const code = match[1] ?? "";
  const surface = match[2] ?? "";
  const seenAt = new Date(Number(match[3]) * 1000);
  if (!isReferralCode(code) || !isShareSurface(surface) || Number.isNaN(seenAt.getTime())) {
    return null;
  }
  const ageMs = now.getTime() - seenAt.getTime();
  if (ageMs < -5 * 60 * 1000 || ageMs > REFERRAL_MAX_AGE_SECONDS * 1000) return null;
  return { code, surface, seenAt };
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
    if (key !== "r" && key !== "source" && key !== "ref") return true;
  }
  const code = parsed.searchParams.get("r");
  if (code != null && !isReferralCode(code)) return true;
  const source = parsed.searchParams.get("source");
  if (source != null && !isShareSurface(source)) return true;
  const ref = parsed.searchParams.get("ref");
  if (ref != null && !surfaceFromShareRef(ref)) return true;
  return false;
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const pool = getPool();
  const existing = await pool.query(
    `SELECT referral_code FROM users WHERE id = $1`,
    [userId],
  );
  const current = existing.rows[0]?.referral_code;
  if (typeof current === "string" && current.length > 0) return current;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomReferralCode();
    try {
      const updated = await pool.query(
        `UPDATE users
         SET referral_code = $2
         WHERE id = $1 AND referral_code IS NULL
         RETURNING referral_code`,
        [userId, code],
      );
      const assigned = updated.rows[0]?.referral_code;
      if (typeof assigned === "string") return assigned;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const again = await pool.query(
      `SELECT referral_code FROM users WHERE id = $1`,
      [userId],
    );
    const raced = again.rows[0]?.referral_code;
    if (typeof raced === "string" && raced.length > 0) return raced;
  }
  throw new Error("Could not assign referral code");
}

export async function personalShareUrl(
  userId: string,
  surface: ShareSurface,
  baseUrl = config.appBaseUrl,
): Promise<string> {
  const code = await ensureReferralCode(userId);
  return referralShareUrl(code, surface, baseUrl);
}

/** Live referrer only. A deleted account does not attribute new visits. */
export async function findReferrerByCode(code: string): Promise<{ userId: string } | null> {
  if (!isReferralCode(code)) return null;
  const result = await getPool().query(
    `SELECT id
     FROM users
     WHERE referral_code = $1
       AND account_state <> 'deleted'`,
    [code],
  );
  const id = result.rows[0]?.id;
  return typeof id === "string" ? { userId: id } : null;
}

export async function resolveShareActor(
  userId: string,
  activeJourneyId: string | null,
): Promise<{ journeyId: string; actorRole: "student" | "supervisor" } | null> {
  if (activeJourneyId) {
    const access = await getJourneyAccess(activeJourneyId, userId);
    if (access && (access.role === "student" || access.role === "supervisor")) {
      return { journeyId: activeJourneyId, actorRole: access.role };
    }
  }
  const pool = getPool();
  const student = await pool.query(
    `SELECT id
     FROM driving_journeys
     WHERE student_user_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  if (student.rows[0]?.id) {
    return { journeyId: String(student.rows[0].id), actorRole: "student" };
  }
  const supervisor = await pool.query(
    `SELECT c.journey_id
     FROM journey_collaborators c
     JOIN driving_journeys j ON j.id = c.journey_id
     WHERE c.user_id = $1
       AND c.role = 'supervisor'
       AND c.status = 'active'
       AND j.status = 'active'
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [userId],
  );
  if (supervisor.rows[0]?.journey_id) {
    return { journeyId: String(supervisor.rows[0].journey_id), actorRole: "supervisor" };
  }
  return null;
}

export async function recordShareEvent(input: {
  name: (typeof SHARE_EVENT_NAMES)[number];
  surface: ShareSurface | null;
  platform: SharePlatform | null;
  userId?: string | null;
  journeyId?: string | null;
  actorRole?: "student" | "supervisor" | null;
  referrerUserId?: string | null;
}): Promise<void> {
  await recordProductEventSafe({
    name: input.name,
    userId: input.userId ?? null,
    journeyId: input.journeyId ?? null,
    actorRole: input.actorRole ?? null,
    shareSurface: input.surface,
    clientPlatform: input.platform,
    referrerUserId: input.referrerUserId ?? null,
  });
}

/**
 * First valid referral wins. A second call for the same account does not
 * replace referred_by_user_id. Self-referral and unknown codes do nothing.
 */
export async function attributeReferralSignup(input: {
  newUserId: string;
  cookieValue: string | undefined;
  platform: SharePlatform | null;
  journeyId?: string | null;
  actorRole?: "student" | "supervisor" | null;
}): Promise<boolean> {
  const parsed = parseReferralCookie(input.cookieValue);
  if (!parsed) return false;
  const referrer = await findReferrerByCode(parsed.code);
  if (!referrer || referrer.userId === input.newUserId) return false;
  const updated = await getPool().query(
    `UPDATE users
     SET referred_by_user_id = $2,
         referred_by_code = $3,
         referred_at = $4,
         updated_at = now()
     WHERE id = $1
       AND referred_by_user_id IS NULL
       AND id <> $2
     RETURNING id`,
    [input.newUserId, referrer.userId, parsed.code, parsed.seenAt],
  );
  if (updated.rowCount !== 1) return false;
  await recordProductEventSafe({
    name: "share_registration",
    userId: input.newUserId,
    journeyId: input.journeyId ?? null,
    actorRole: input.actorRole ?? null,
    shareSurface: parsed.surface,
    clientPlatform: input.platform,
    referrerUserId: referrer.userId,
  });
  return true;
}

function randomReferralCode(): string {
  let code = "";
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}
