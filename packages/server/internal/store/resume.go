package store

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type ResumeSnapshot struct {
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

func (s *Store) Resume(ctx context.Context, userID string) (ResumeSnapshot, error) {
	var v ResumeSnapshot
	err := s.Pool.QueryRow(ctx, "SELECT state,revision,updated_at FROM resumes WHERE user_id=$1", userID).
		Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

// The row lock protects first creation as well as updates. Receipts make retries
// safe after a lost response, even if another device has since saved a new version.
func (s *Store) SaveResume(ctx context.Context, userID string, base int64, mutation string, state json.RawMessage) (ResumeSnapshot, bool, error) {
	var v ResumeSnapshot
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return v, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return v, false, err
	}
	err = tx.QueryRow(ctx, "SELECT state,revision,updated_at FROM resumes WHERE user_id=$1", userID).
		Scan(&v.State, &v.Revision, &v.UpdatedAt)
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
	err = tx.QueryRow(ctx, "SELECT base_revision,state_digest=$3 FROM resume_mutations WHERE user_id=$1 AND mutation_id=$2", userID, mutation, digest[:]).
		Scan(&previousBase, &same)
	if err == nil {
		if previousBase != base || !same {
			return v, false, ErrMutationReuse
		}
		return v, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return v, false, err
	}
	// An older single-resume client must never replace an upgraded library.
	// Existing receipt replays above remain idempotent and do not perform writes.
	var currentVersion, incomingVersion struct {
		Version int `json:"version"`
	}
	if len(v.State) > 0 {
		if err = json.Unmarshal(v.State, &currentVersion); err != nil {
			return v, false, err
		}
	}
	if err = json.Unmarshal(state, &incomingVersion); err != nil {
		return v, false, err
	}
	if currentVersion.Version == 2 && incomingVersion.Version != 2 {
		return v, true, nil
	}
	if v.Revision != base {
		return v, true, nil
	}
	err = tx.QueryRow(ctx, `INSERT INTO resumes(user_id,state,revision) VALUES($1,$2::jsonb,$3)
 ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=now()
 RETURNING state,revision,updated_at`, userID, string(state), base+1).
		Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO resume_mutations(user_id,mutation_id,base_revision,state_digest) VALUES($1,$2,$3,$4)", userID, mutation, base, digest[:]); err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}
