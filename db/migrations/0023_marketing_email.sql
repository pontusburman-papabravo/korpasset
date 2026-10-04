-- Optional marketing email is separate from account, security and product mail.
-- Existing rows stay opted out. Waitlist signups do not write these columns.
-- The weekly journey summary is product communication and does not read this flag.

BEGIN;

ALTER TABLE users
  ADD COLUMN marketing_email_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_email_consent_at timestamptz,
  ADD COLUMN marketing_email_opt_out_at timestamptz;

CREATE INDEX idx_users_marketing_email_opt_in
  ON users (id)
  WHERE marketing_email_opt_in AND account_state <> 'deleted';

CREATE TABLE marketing_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_unsubscribe_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX idx_marketing_unsubscribe_tokens_user_id
  ON marketing_unsubscribe_tokens (user_id);

COMMIT;
