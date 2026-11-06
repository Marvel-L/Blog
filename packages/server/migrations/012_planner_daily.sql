CREATE TABLE planner_daily (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL CHECK (base_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
