-- Who last set the shared next-drive plan (active training_focus_items).

BEGIN;

ALTER TABLE training_focus_items
  ADD COLUMN created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_training_focus_items_created_by
  ON training_focus_items (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

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
      'training_guidance_opened'
    )
  );

COMMIT;
