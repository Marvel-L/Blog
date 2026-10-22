package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type TrendSnapshot struct {
	State     json.RawMessage `json:"state"`
	Revision  int64           `json:"revision"`
	UpdatedAt *time.Time      `json:"updatedAt"`
}

var ErrMutationReuse = errors.New("mutation reused with different payload")

func (s *Store) Trend(ctx context.Context, userID string) (TrendSnapshot, error) {
	var v TrendSnapshot
	err := s.Pool.QueryRow(ctx, "SELECT state,revision,updated_at FROM trend_dashboards WHERE user_id=$1", userID).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, nil
	}
	return v, err
}

// Lock the account even before its first dashboard exists. This serializes
// compare-and-swap and retries without requiring a placeholder dashboard.
func (s *Store) SaveTrend(ctx context.Context, userID string, base int64, mutation string, state json.RawMessage) (TrendSnapshot, bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return TrendSnapshot{}, false, err
	}
	defer tx.Rollback(context.Background())
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return TrendSnapshot{}, false, err
	}
	var v TrendSnapshot
	var previous string
	var previousBase int64
	var same bool
	err = tx.QueryRow(ctx, `SELECT state,revision,updated_at,mutation_id::text,base_revision,state=$2::jsonb
 FROM trend_dashboards WHERE user_id=$1`, userID, string(state)).Scan(&v.State, &v.Revision, &v.UpdatedAt, &previous, &previousBase, &same)
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
	err = tx.QueryRow(ctx, `INSERT INTO trend_dashboards(user_id,state,revision,mutation_id,base_revision)
 VALUES($1,$2::jsonb,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE
 SET state=EXCLUDED.state,revision=EXCLUDED.revision,mutation_id=EXCLUDED.mutation_id,
 base_revision=EXCLUDED.base_revision,updated_at=now() RETURNING state,revision,updated_at`,
		userID, string(state), base+1, mutation, base).Scan(&v.State, &v.Revision, &v.UpdatedAt)
	if err != nil {
		return v, false, err
	}
	return v, false, tx.Commit(ctx)
}

func (s *Store) BeginTrendConnect(ctx context.Context, session, origin, challenge string) (string, error) {
	code := Secret()
	result, err := s.Pool.Exec(ctx, `INSERT INTO trend_connect_codes(code_hash,session_hash,origin,challenge,expires_at)
 SELECT $1,token_hash,$3,$4,now()+interval '60 seconds' FROM sessions WHERE token_hash=$2 AND expires_at>now()`,
		Hash(code), Hash(session), origin, challenge)
	if err != nil || result.RowsAffected() == 0 {
		return "", err
	}
	return code, nil
}

func (s *Store) ExchangeTrend(ctx context.Context, code, origin, challenge string) (string, *User, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", nil, err
	}
	defer tx.Rollback(context.Background())
	var session string
	err = tx.QueryRow(ctx, `DELETE FROM trend_connect_codes c USING sessions s
 WHERE c.code_hash=$1 AND c.origin=$2 AND c.challenge=$3 AND c.expires_at>now()
 AND s.token_hash=c.session_hash AND s.expires_at>now() RETURNING c.session_hash`,
		Hash(code), origin, challenge).Scan(&session)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	token := Secret()
	if _, err = tx.Exec(ctx, `INSERT INTO trend_sessions(token_hash,session_hash,origin,expires_at)
 VALUES($1,$2,$3,now()+interval '1 hour')`, Hash(token), session, origin); err != nil {
		return "", nil, err
	}
	var u User
	err = tx.QueryRow(ctx, `SELECT u.id::text,u.login,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1`, session).Scan(&u.ID, &u.Login, &u.Name)
	if err != nil {
		return "", nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", nil, err
	}
	return token, &u, nil
}

func (s *Store) FindTrendUser(ctx context.Context, token, origin string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `SELECT u.id::text,u.login,u.name FROM trend_sessions t
 JOIN sessions s ON s.token_hash=t.session_hash JOIN users u ON u.id=s.user_id
 WHERE t.token_hash=$1 AND t.origin=$2 AND t.expires_at>now() AND s.expires_at>now()`, Hash(token), origin).Scan(&u.ID, &u.Login, &u.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) RevokeTrend(ctx context.Context, token, origin string) error {
	_, err := s.Pool.Exec(ctx, "DELETE FROM trend_sessions WHERE token_hash=$1 AND origin=$2", Hash(token), origin)
	return err
}
