-- Additional login methods share the existing user ID. No business-data migration.
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;
CREATE TABLE account_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$')
);
CREATE UNIQUE INDEX account_credentials_username ON account_credentials(lower(username));
ALTER TABLE oauth_attempts ADD COLUMN binding_session_hash text;
CREATE TABLE account_login_limits (
  account_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
