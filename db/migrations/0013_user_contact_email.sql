-- Contact address an admin can see and correct, plus the address Apple/Google
-- actually send. Login still keys off provider + subject, not email.

ALTER TABLE users
  ADD COLUMN contact_email text,
  ADD COLUMN contact_email_normalized text;

CREATE INDEX idx_users_contact_email_normalized
  ON users (contact_email_normalized)
  WHERE contact_email_normalized IS NOT NULL;

ALTER TABLE auth_identities
  ADD COLUMN email text,
  ADD COLUMN email_normalized text;

CREATE INDEX idx_auth_identities_email_normalized
  ON auth_identities (email_normalized)
  WHERE email_normalized IS NOT NULL;
