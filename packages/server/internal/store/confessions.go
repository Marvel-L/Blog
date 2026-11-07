package store

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

// ConfessionSnapshot contains only one authenticated user's private archive.
type ConfessionSnapshot struct {
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

func (s *Store) Confessions(ctx context.Context, userID string) (ConfessionSnapshot, error) {
	var v ConfessionSnapshot
	err := s.Pool.QueryRow(ctx, "SELECT state,revision,updated_at FROM confessions WHERE user_id=$1", userID).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}
func (s *Store) SaveConfessions(ctx context.Context, userID string, base int64, mutation string, state json.RawMessage) (ConfessionSnapshot, bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return ConfessionSnapshot{}, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return ConfessionSnapshot{}, false, err
	}
	var v ConfessionSnapshot
	err = tx.QueryRow(ctx, "SELECT state,revision,updated_at FROM confessions WHERE user_id=$1", userID).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return v, false, err
	}
	var canonical []byte
	if err = tx.QueryRow(ctx, "SELECT ($1::jsonb)::text", string(state)).Scan(&canonical); err != nil {
		return v, false, err
	}
	digest := sha256.Sum256(canonical)
	var previousBase int64
	var same bool
	err = tx.QueryRow(ctx, "SELECT base_revision,state_digest=$3 FROM confession_mutations WHERE user_id=$1 AND mutation_id=$2", userID, mutation, digest[:]).Scan(&previousBase, &same)
	if err == nil {
		if previousBase != base || !same {
			return v, false, ErrMutationReuse
		}
		return v, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return v, false, err
	}
	if v.Revision != base {
		return v, true, nil
	}
	err = tx.QueryRow(ctx, `INSERT INTO confessions(user_id,state,revision) VALUES($1,$2::jsonb,$3)
 ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=now()
 RETURNING state,revision,updated_at`, userID, string(state), base+1).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO confession_mutations(user_id,mutation_id,base_revision,state_digest) VALUES($1,$2,$3,$4)", userID, mutation, base, digest[:]); err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}
