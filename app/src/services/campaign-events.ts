import { getPool } from "../db/pool.js";
import { readCampaignQuery } from "../http/campaign-query.js";

export const CAMPAIGN_EVENT_NAMES = [
  "landing_view",
  "hero_cta_click",
  "product_cta_click",
  "final_cta_click",
  "android_notify_started",
  "android_notify_completed",
  "app_store_click",
  "google_play_click",
] as const;

export type CampaignEventName = (typeof CAMPAIGN_EVENT_NAMES)[number];

const PLACEMENTS = ["hero", "product", "final", "sticky", "form"] as const;
const PLATFORMS = ["ios", "android"] as const;

export interface CampaignEventInput {
  name: string;
  placement?: string | null;
  platform?: string | null;
  variant?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : null;
}

/** Accepts the public beacon body. fbclid is ignored on purpose. */
export function parseCampaignEvent(body: unknown): CampaignEventInput | null {
  if (!body || typeof body !== "object") return null;
  const source = body as Record<string, unknown>;
  const name = oneOf(source.event ?? source.event_name, CAMPAIGN_EVENT_NAMES);
  if (!name) return null;
  const campaign = readCampaignQuery(source);
  return {
    name,
    placement: oneOf(source.placement, PLACEMENTS),
    platform: oneOf(source.platform, PLATFORMS),
    variant: oneOf(source.variant ?? campaign.h, ["a", "b", "c"]),
    utmSource: campaign.utm_source ?? null,
    utmMedium: campaign.utm_medium ?? null,
    utmCampaign: campaign.utm_campaign ?? null,
    utmContent: campaign.utm_content ?? null,
    utmTerm: campaign.utm_term ?? null,
  };
}

export async function recordCampaignEvent(input: CampaignEventInput): Promise<void> {
  const parsed = parseCampaignEvent({
    event: input.name,
    placement: input.placement,
    platform: input.platform,
    variant: input.variant,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    utm_term: input.utmTerm,
  });
  if (!parsed) return;
  await getPool().query(
    `INSERT INTO campaign_events (
       event_name, placement, platform, variant,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      parsed.name,
      parsed.placement,
      parsed.platform,
      parsed.variant,
      parsed.utmSource,
      parsed.utmMedium,
      parsed.utmCampaign,
      parsed.utmContent,
      parsed.utmTerm,
    ],
  );
}
