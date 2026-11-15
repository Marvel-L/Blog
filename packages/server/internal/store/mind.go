package store

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type MindMap struct {
	ID        string          `json:"id"`
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

type MindSummary struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Layout    string    `json:"layout"`
	NodeCount int       `json:"nodeCount"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (s *Store) MindMaps(ctx context.Context, userID string) ([]MindSummary, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id::text,state->>'title',state->>'layout',
 jsonb_array_length(state->'nodes'),updated_at FROM mind_maps WHERE user_id=$1 ORDER BY updated_at DESC,id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []MindSummary{}
	for rows.Next() {
		var item MindSummary
		if err = rows.Scan(&item.ID, &item.Title, &item.Layout, &item.NodeCount, &item.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Store) MindMap(ctx context.Context, userID, id string) (MindMap, error) {
	v := MindMap{ID: id}
	err := s.Pool.QueryRow(ctx, `SELECT state,revision,updated_at FROM mind_maps WHERE user_id=$1 AND id=$2`, userID, id).
		Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

// Serialize per account and retain receipts: a timed-out write can safely be
// retried without advancing its revision or overwriting a newer document.
func (s *Store) SaveMindMap(ctx context.Context, userID, id string, base int64, mutation string, state json.RawMessage) (MindMap, bool, error) {
	v := MindMap{ID: id}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return v, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return v, false, err
	}
	err = tx.QueryRow(ctx, "SELECT state,revision,updated_at FROM mind_maps WHERE user_id=$1 AND id=$2", userID, id).
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
	var previousMap string
	var same bool
	err = tx.QueryRow(ctx, `SELECT base_revision,map_id::text,state_digest=$3
 FROM mind_map_mutations WHERE user_id=$1 AND mutation_id=$2`, userID, mutation, digest[:]).
		Scan(&previousBase, &previousMap, &same)
	if err == nil {
		if previousBase != base || previousMap != id || !same {
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
	err = tx.QueryRow(ctx, `INSERT INTO mind_maps(user_id,id,state,revision) VALUES($1,$2,$3::jsonb,$4)
 ON CONFLICT(user_id,id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=now()
 RETURNING state,revision,updated_at`, userID, id, string(state), base+1).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO mind_map_mutations(user_id,mutation_id,map_id,base_revision,state_digest)
 VALUES($1,$2,$3,$4,$5)`, userID, mutation, id, base, digest[:]); err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}
