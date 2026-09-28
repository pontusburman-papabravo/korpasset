-- One-time code that moves a verified Google login from the system browser
-- back into the installed Android app. This is not a session token.
-- Do not log the code.

CREATE TABLE oauth_handoffs (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  redirect_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oauth_handoffs_expires_at_idx ON oauth_handoffs (expires_at);
