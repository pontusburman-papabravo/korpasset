-- Sign in with Apple refresh token. Credential material for the Apple
-- identity only. Null for Google and for Apple identities created before a
-- refresh token was stored. Never return this column to clients, logs,
-- analytics, or error responses. No application-level encryption: the
-- database does not encrypt other credentials, and this value is kept off
-- every API and log path instead.

ALTER TABLE auth_identities
  ADD COLUMN apple_refresh_token text;

COMMENT ON COLUMN auth_identities.apple_refresh_token IS
  'Sign in with Apple refresh token. Apple identities only. Credential material; do not log or expose.';
