CREATE TABLE monthly_planners (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  markdown text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  github_status text NOT NULL DEFAULT 'disabled' CHECK (github_status IN ('disabled','pending','synced','failed')),
  github_attempts integer NOT NULL DEFAULT 0,
  github_next_attempt_at timestamptz,
  github_committed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monthly_planners_github_queue ON monthly_planners(github_next_attempt_at)
  WHERE github_status IN ('pending','failed');
