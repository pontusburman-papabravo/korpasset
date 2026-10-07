-- Cookieless counts for /kom-igang. No user id, no IP, no Meta click id.

BEGIN;

CREATE TABLE campaign_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  event_name   text NOT NULL,
  placement    text,
  platform     text,
  variant      text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  CONSTRAINT campaign_events_name_known CHECK (
    event_name IN (
      'landing_view',
      'hero_cta_click',
      'product_cta_click',
      'final_cta_click',
      'android_notify_started',
      'android_notify_completed',
      'app_store_click',
      'google_play_click'
    )
  ),
  CONSTRAINT campaign_events_placement_known CHECK (
    placement IS NULL OR placement IN ('hero', 'product', 'final', 'sticky', 'form')
  ),
  CONSTRAINT campaign_events_platform_known CHECK (
    platform IS NULL OR platform IN ('ios', 'android')
  ),
  CONSTRAINT campaign_events_variant_known CHECK (
    variant IS NULL OR variant IN ('a', 'b', 'c')
  )
);

CREATE INDEX idx_campaign_events_name_created
  ON campaign_events (event_name, created_at DESC);

COMMIT;
