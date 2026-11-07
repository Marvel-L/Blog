CREATE TABLE confessions (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency receipts are private to the authenticated account.
CREATE TABLE confession_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  state_digest bytea NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
