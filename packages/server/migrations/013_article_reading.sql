CREATE TABLE article_reading (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep mutation receipts across subsequent writes so a delayed retry cannot count twice.
CREATE TABLE article_reading_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  state_digest bytea NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
