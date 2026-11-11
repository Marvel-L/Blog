package store

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type WeeklyJournalSnapshot struct {
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

func (s *Store) WeeklyJournal(ctx context.Context, userID, week string) (WeeklyJournalSnapshot, error) {
	var v WeeklyJournalSnapshot
	err := s.Pool.QueryRow(ctx, "SELECT state,revision,updated_at FROM weekly_journals WHERE user_id=$1 AND week_start=$2::date", userID, week).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

func (s *Store) SaveWeeklyJournal(ctx context.Context, userID, week string, base int64, mutation string, state json.RawMessage) (WeeklyJournalSnapshot, bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return WeeklyJournalSnapshot{}, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return WeeklyJournalSnapshot{}, false, err
	}
	var v WeeklyJournalSnapshot
	err = tx.QueryRow(ctx, "SELECT state,revision,updated_at FROM weekly_journals WHERE user_id=$1 AND week_start=$2::date", userID, week).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return v, false, err
	}
	var canonical []byte
	if err = tx.QueryRow(ctx, "SELECT ($1::jsonb)::text", string(state)).Scan(&canonical); err != nil {
		return v, false, err
	}
	digest := sha256.Sum256(canonical)
	var previousBase int64
	var previousWeek string
	var same bool
	err = tx.QueryRow(ctx, "SELECT base_revision,week_start::text,state_digest=$3 FROM weekly_journal_mutations WHERE user_id=$1 AND mutation_id=$2", userID, mutation, digest[:]).Scan(&previousBase, &previousWeek, &same)
	if err == nil {
		if previousBase != base || previousWeek != week || !same {
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
	err = tx.QueryRow(ctx, `INSERT INTO weekly_journals(user_id,week_start,state,revision) VALUES($1,$2::date,$3::jsonb,$4)
 ON CONFLICT(user_id,week_start) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=now()
 RETURNING state,revision,updated_at`, userID, week, string(state), base+1).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO weekly_journal_mutations(user_id,mutation_id,week_start,base_revision,state_digest) VALUES($1,$2,$3::date,$4,$5)", userID, mutation, week, base, digest[:]); err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}
