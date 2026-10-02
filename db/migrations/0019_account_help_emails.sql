-- One successful help email per account and early-onboarding stop.
-- The address is not stored here. Missing address must not insert a row.

CREATE TABLE account_help_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_help_emails_type_known CHECK (
    type IN ('no_journey', 'no_connected_supervisor')
  ),
  CONSTRAINT account_help_emails_account_type_unique UNIQUE (account_id, type)
);
