-- Personal referral codes for Tipsa en vän.
-- The code is opaque. It is not a user id, email, name or a counter.
-- referrer_user_id on product_events has no foreign key, same as user_id,
-- so the event still points at the account after a soft delete.

BEGIN;

ALTER TABLE users
  ADD COLUMN referral_code text,
  ADD COLUMN referred_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN referred_by_code text,
  ADD COLUMN referred_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_referral_code_format CHECK (
    referral_code IS NULL
    OR referral_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
  );

ALTER TABLE users
  ADD CONSTRAINT users_referred_by_code_format CHECK (
    referred_by_code IS NULL
    OR referred_by_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
  );

ALTER TABLE users
  ADD CONSTRAINT users_not_self_referred CHECK (
    referred_by_user_id IS NULL OR referred_by_user_id <> id
  );

CREATE UNIQUE INDEX idx_users_referral_code
  ON users (referral_code)
  WHERE referral_code IS NOT NULL;

ALTER TABLE product_events
  ADD COLUMN referrer_user_id uuid;

CREATE INDEX idx_product_events_referrer
  ON product_events (referrer_user_id, event_name, created_at DESC)
  WHERE referrer_user_id IS NOT NULL;

COMMIT;
