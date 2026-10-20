CREATE TABLE users (
  id uuid PRIMARY KEY,
  github_id text NOT NULL UNIQUE,
  login text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oauth_attempts (
  state_hash text PRIMARY KEY,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX oauth_attempts_expiry ON oauth_attempts(expires_at);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE user_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  name text NOT NULL CHECK (name IN ('page_view', 'login_success')),
  path text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX user_events_recent ON user_events(user_id, received_at DESC);
CREATE INDEX user_events_retention ON user_events(received_at);
