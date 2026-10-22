ALTER TABLE oauth_attempts ADD COLUMN return_path text NOT NULL DEFAULT '/Blog/';

CREATE TABLE trend_dashboards (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trend_connect_codes (
  code_hash text PRIMARY KEY,
  session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  origin text NOT NULL,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX trend_connect_codes_expiry ON trend_connect_codes(expires_at);
CREATE TABLE trend_sessions (
  token_hash text PRIMARY KEY,
  session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  origin text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX trend_sessions_expiry ON trend_sessions(expires_at);
