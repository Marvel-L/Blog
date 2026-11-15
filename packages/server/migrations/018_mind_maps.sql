CREATE TABLE mind_maps (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX mind_maps_recent ON mind_maps(user_id, updated_at DESC);

CREATE TABLE mind_map_mutations (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  map_id uuid NOT NULL,
  base_revision bigint NOT NULL,
  state_digest bytea NOT NULL,
  PRIMARY KEY (user_id, mutation_id),
  FOREIGN KEY (user_id, map_id) REFERENCES mind_maps(user_id, id) ON DELETE CASCADE
);
