const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
] as const;

const UTM_VALUE = /^[\p{L}\p{N}._~+:@-]{1,80}$/u;
const FBCLID_VALUE = /^[A-Za-z0-9_-]{1,200}$/;

export const HERO_VARIANTS = ["a", "b", "c"] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];

export interface CampaignQuery {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  fbclid?: string;
  h?: HeroVariant;
}

function asRecord(query: unknown): Record<string, unknown> | null {
  if (!query || typeof query !== "object") return null;
  return query as Record<string, unknown>;
}

/** Allowlisted campaign params only. Dropped values never reach a redirect or a form. */
export function readCampaignQuery(query: unknown): CampaignQuery {
  const source = asRecord(query);
  if (!source) return {};
  const result: CampaignQuery = {};
  for (const key of UTM_KEYS) {
    const raw = source[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!UTM_VALUE.test(value)) continue;
    result[key] = value;
  }
  if (typeof source.fbclid === "string") {
    const fbclid = source.fbclid.trim();
    if (FBCLID_VALUE.test(fbclid)) result.fbclid = fbclid;
  }
  if (typeof source.h === "string") {
    const variant = source.h.trim().toLowerCase();
    if (variant === "a" || variant === "b" || variant === "c") result.h = variant;
  }
  return result;
}

export function campaignSearch(query: unknown): string {
  const campaign = readCampaignQuery(query);
  const params = new URLSearchParams();
  for (const key of [...UTM_KEYS, "fbclid", "h"] as const) {
    const value = campaign[key];
    if (value) params.append(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/** Query string wins over a posted form, so a crafted body cannot replace the ad click. */
export function campaignSearchFromSources(query: unknown, body: unknown): string {
  return campaignSearch({
    ...readCampaignQuery(body),
    ...readCampaignQuery(query),
  });
}

export function heroVariantFromQuery(query: unknown): HeroVariant {
  return readCampaignQuery(query).h ?? "a";
}
