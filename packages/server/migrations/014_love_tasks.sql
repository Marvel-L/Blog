CREATE TABLE love_tasks (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Retain successful mutations so delayed retries cannot duplicate or revert wishes.
CREATE TABLE love_task_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  state_digest bytea NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
