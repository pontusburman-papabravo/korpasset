-- Last time a signed-in person opened the product, and the app build they used.
-- Admin reads this to see who is still testing and which binary reported a bug.

ALTER TABLE users
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN client_platform text,
  ADD COLUMN client_app_version text,
  ADD COLUMN client_app_build text;

ALTER TABLE users
  ADD CONSTRAINT users_client_platform_known CHECK (
    client_platform IS NULL OR client_platform IN ('ios', 'android')
  ),
  ADD CONSTRAINT users_client_app_version_len CHECK (
    client_app_version IS NULL OR char_length(client_app_version) BETWEEN 1 AND 32
  ),
  ADD CONSTRAINT users_client_app_build_len CHECK (
    client_app_build IS NULL OR char_length(client_app_build) BETWEEN 1 AND 32
  );
