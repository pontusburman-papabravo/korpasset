-- One weekly summary attempt per journey and Stockholm ISO week.
-- The address is not stored. status = sent is never replaced by another send.
-- status = failed may be claimed again. status = sending is left in place
-- so a retry after a crash cannot emit a second copy.

CREATE TABLE journey_weekly_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES driving_journeys (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  week_key text NOT NULL,
  template text NOT NULL,
  status text NOT NULL,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_weekly_emails_template_known CHECK (
    template IN ('weekly_summary')
  ),
  CONSTRAINT journey_weekly_emails_status_known CHECK (
    status IN ('sending', 'sent', 'failed')
  ),
  CONSTRAINT journey_weekly_emails_week_key_shape CHECK (
    week_key ~ '^[0-9]{4}-W[0-9]{2}$'
  ),
  CONSTRAINT journey_weekly_emails_unique UNIQUE (journey_id, week_key, template)
);

CREATE INDEX idx_journey_weekly_emails_journey_created
  ON journey_weekly_emails (journey_id, created_at DESC);
