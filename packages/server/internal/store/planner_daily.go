package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type DailyPlannerSnapshot struct {
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

func (s *Store) DailyPlanner(ctx context.Context, userID string) (DailyPlannerSnapshot, error) {
	var v DailyPlannerSnapshot
	err := s.Pool.QueryRow(ctx, "SELECT state,revision,updated_at FROM planner_daily WHERE user_id=$1", userID).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

func (s *Store) SaveDailyPlanner(ctx context.Context, userID string, base int64, mutation string, state json.RawMessage) (DailyPlannerSnapshot, bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return DailyPlannerSnapshot{}, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return DailyPlannerSnapshot{}, false, err
	}
	var v DailyPlannerSnapshot
	var previous string
	var previousBase int64
	var same bool
	err = tx.QueryRow(ctx, `SELECT state,revision,updated_at,mutation_id::text,base_revision,state=$2::jsonb
		FROM planner_daily WHERE user_id=$1`, userID, string(state)).Scan(&v.State, &v.Revision, &v.UpdatedAt, &previous, &previousBase, &same)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return v, false, err
	}
	if previous == mutation {
		if previousBase != base || !same {
			return v, false, ErrMutationReuse
		}
		return v, false, tx.Commit(ctx)
	}
	if v.Revision != base {
		return v, true, nil
	}
	err = tx.QueryRow(ctx, `INSERT INTO planner_daily(user_id,state,revision,mutation_id,base_revision)
		VALUES($1,$2::jsonb,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET state=EXCLUDED.state,
		revision=EXCLUDED.revision,mutation_id=EXCLUDED.mutation_id,base_revision=EXCLUDED.base_revision,updated_at=now()
		RETURNING state,revision,updated_at`, userID, string(state), base+1, mutation, base).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}
