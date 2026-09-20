-- Beta funnel events. No direct personal identifiers beyond opaque ids.
CREATE TABLE product_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name         text NOT NULL,
  journey_id         uuid REFERENCES driving_journeys (id) ON DELETE SET NULL,
  user_id            uuid,
  actor_role         text,
  supervisor_count   integer,
  focus_skill_count  integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_events_name_known CHECK (
    event_name IN (
      'journey_created',
      'supervisor_connected',
      'drive_focus_saved',
      'drive_started',
      'drive_completed',
      'rating_completed',
      'recap_viewed',
      'second_drive_completed'
    )
  ),
  CONSTRAINT product_events_role_known CHECK (
    actor_role IS NULL OR actor_role IN ('student', 'supervisor')
  )
);

CREATE INDEX idx_product_events_journey_name
  ON product_events (journey_id, event_name, created_at DESC);
