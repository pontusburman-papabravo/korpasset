-- Optional marketing email is separate from account, security and service mail.
-- Existing rows stay opted out. Waitlist signups do not write these columns.

BEGIN;

ALTER TABLE users
  ADD COLUMN marketing_email_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_email_consent_at timestamptz,
  ADD COLUMN marketing_email_opt_out_at timestamptz;

UPDATE users
SET marketing_email_opt_in = false
WHERE marketing_email_opt_in IS DISTINCT FROM false;

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

CREATE TYPE email_broadcast_kind AS ENUM ('marketing', 'service');
CREATE TYPE email_broadcast_status AS ENUM ('draft', 'sent');

CREATE TABLE email_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind email_broadcast_kind NOT NULL,
  subject text NOT NULL,
  heading text NOT NULL,
  body text NOT NULL,
  status email_broadcast_status NOT NULL DEFAULT 'draft',
  recipient_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_by_admin_id uuid REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT email_broadcasts_subject_len CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT email_broadcasts_heading_len CHECK (char_length(heading) BETWEEN 1 AND 200),
  CONSTRAINT email_broadcasts_body_len CHECK (char_length(body) BETWEEN 1 AND 20000),
  CONSTRAINT email_broadcasts_status_fields CHECK (
    (
      status = 'draft'
      AND sent_at IS NULL
      AND recipient_count IS NULL
    )
    OR (
      status = 'sent'
      AND sent_at IS NOT NULL
      AND recipient_count IS NOT NULL
      AND recipient_count >= 0
    )
  )
);

CREATE INDEX idx_email_broadcasts_created_at
  ON email_broadcasts (created_at DESC);

COMMIT;
