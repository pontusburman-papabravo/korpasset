-- At most one Apple identity and one Google identity per user.
-- Apple + Google on the same user remains allowed.
CREATE UNIQUE INDEX auth_identities_one_apple_or_google_per_user
  ON auth_identities (user_id, provider)
  WHERE provider IN ('apple', 'google');
