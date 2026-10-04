-- Anonymous share events on the existing product_events log.
-- share_surface is the channel (app, website, weekly_email), never a person.
-- client_platform is ios, android or web. No names, addresses or stats.

BEGIN;

ALTER TABLE product_events
  ADD COLUMN share_surface text,
  ADD COLUMN client_platform text;

ALTER TABLE product_events
  DROP CONSTRAINT product_events_name_known;

ALTER TABLE product_events
  ADD CONSTRAINT product_events_name_known CHECK (
    event_name IN (
      'journey_created',
      'supervisor_connected',
      'drive_focus_saved',
      'drive_started',
      'drive_completed',
      'rating_completed',
      'recap_viewed',
      'second_drive_completed',
      'onboarding_role_selected',
      'student_handoff_started',
      'stale_drive_nudge_shown',
      'journey_switched',
      'next_drive_plan_created',
      'next_drive_plan_updated',
      'training_guidance_opened',
      'share_prompt_viewed',
      'share_started',
      'share_link_copied',
      'share_completed',
      'share_landing_viewed',
      'share_registration'
    )
  );

ALTER TABLE product_events
  ADD CONSTRAINT product_events_share_surface_known CHECK (
    share_surface IS NULL OR share_surface IN ('app', 'website', 'weekly_email')
  );

ALTER TABLE product_events
  ADD CONSTRAINT product_events_client_platform_known CHECK (
    client_platform IS NULL OR client_platform IN ('ios', 'android', 'web')
  );

CREATE INDEX idx_product_events_share
  ON product_events (event_name, share_surface, created_at DESC)
  WHERE event_name LIKE 'share_%';

COMMIT;
