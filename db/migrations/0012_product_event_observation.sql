-- Observation dimensions for parent-handoff and stale-drive analysis.
-- Reuses product_events; no new analytics table.

BEGIN;

ALTER TABLE product_events
  ADD COLUMN event_source text,
  ADD COLUMN practice_stage text,
  ADD COLUMN days_since_drive_bucket text;

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
      'stale_drive_nudge_shown'
    )
  );

ALTER TABLE product_events
  ADD CONSTRAINT product_events_source_known CHECK (
    event_source IS NULL OR event_source IN ('direct', 'parent_handoff')
  );

ALTER TABLE product_events
  ADD CONSTRAINT product_events_practice_stage_known CHECK (
    practice_stage IS NULL
    OR practice_stage IN ('unknown', 'just_started', 'building', 'near_test')
  );

ALTER TABLE product_events
  ADD CONSTRAINT product_events_days_bucket_known CHECK (
    days_since_drive_bucket IS NULL
    OR days_since_drive_bucket IN ('5-7', '8-14', '15-30', '31+')
  );

COMMIT;
