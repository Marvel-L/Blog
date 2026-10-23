package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type PlannerSnapshot struct {
	State             json.RawMessage `json:"state"`
	Revision          int64           `json:"revision"`
	UpdatedAt         *time.Time      `json:"updatedAt"`
	GithubStatus      string          `json:"githubStatus"`
	GithubCommittedAt *time.Time      `json:"githubCommittedAt"`
}

type PlannerCommit struct {
	UserID, Login, Markdown string
	Revision                int64
}

func (s *Store) Planner(ctx context.Context, userID string) (PlannerSnapshot, error) {
	var v PlannerSnapshot
	err := s.Pool.QueryRow(ctx, `SELECT state,revision,updated_at,github_status,github_committed_at
	 FROM monthly_planners WHERE user_id=$1`, userID).Scan(&v.State, &v.Revision, &v.UpdatedAt, &v.GithubStatus, &v.GithubCommittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

func (s *Store) SavePlanner(ctx context.Context, userID string, base int64, mutation string, state json.RawMessage, markdown string, githubEnabled bool) (PlannerSnapshot, bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return PlannerSnapshot{}, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return PlannerSnapshot{}, false, err
	}
	var v PlannerSnapshot
	var previous string
	var previousBase int64
	var same bool
	err = tx.QueryRow(ctx, `SELECT state,revision,updated_at,github_status,github_committed_at,mutation_id::text,base_revision,state=$2::jsonb
	 FROM monthly_planners WHERE user_id=$1`, userID, string(state)).Scan(&v.State, &v.Revision, &v.UpdatedAt, &v.GithubStatus, &v.GithubCommittedAt, &previous, &previousBase, &same)
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
	status := "disabled"
	var next any
	if githubEnabled {
		status = "pending"
		next = time.Now()
	}
	err = tx.QueryRow(ctx, `INSERT INTO monthly_planners(user_id,state,markdown,revision,mutation_id,base_revision,github_status,github_attempts,github_next_attempt_at)
	 VALUES($1,$2::jsonb,$3,$4,$5,$6,$7,0,$8) ON CONFLICT(user_id) DO UPDATE SET
	 state=EXCLUDED.state,markdown=EXCLUDED.markdown,revision=EXCLUDED.revision,mutation_id=EXCLUDED.mutation_id,
	 base_revision=EXCLUDED.base_revision,github_status=EXCLUDED.github_status,github_attempts=0,
	 github_next_attempt_at=EXCLUDED.github_next_attempt_at,updated_at=now()
	 RETURNING state,revision,updated_at,github_status,github_committed_at`, userID, string(state), markdown, base+1, mutation, base, status, next).Scan(&v.State, &v.Revision, &v.UpdatedAt, &v.GithubStatus, &v.GithubCommittedAt)
	if err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}

func (s *Store) PendingPlannerCommits(ctx context.Context, limit int) ([]PlannerCommit, error) {
	rows, err := s.Pool.Query(ctx, `SELECT p.user_id::text,u.login,p.markdown,p.revision FROM monthly_planners p
	 JOIN users u ON u.id=p.user_id WHERE p.github_status IN ('pending','failed') AND p.github_next_attempt_at<=now()
	 ORDER BY p.github_next_attempt_at LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []PlannerCommit{}
	for rows.Next() {
		var v PlannerCommit
		if err = rows.Scan(&v.UserID, &v.Login, &v.Markdown, &v.Revision); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}

func (s *Store) FinishPlannerCommit(ctx context.Context, userID string, revision int64, success bool) error {
	if success {
		_, err := s.Pool.Exec(ctx, `UPDATE monthly_planners SET github_status='synced',github_committed_at=now(),github_next_attempt_at=NULL
		 WHERE user_id=$1 AND revision=$2`, userID, revision)
		return err
	}
	_, err := s.Pool.Exec(ctx, `UPDATE monthly_planners SET github_status='failed',github_attempts=github_attempts+1,
	 github_next_attempt_at=now()+(interval '1 minute' * LEAST(60, power(2, LEAST(github_attempts,5))))
	 WHERE user_id=$1 AND revision=$2`, userID, revision)
	return err
}
