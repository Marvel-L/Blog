package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID    string `json:"id"`
	Login string `json:"login"`
	Name  string `json:"name"`
}
type Event struct {
	EventID    string    `json:"eventId"`
	Name       string    `json:"name"`
	Path       string    `json:"path"`
	OccurredAt time.Time `json:"occurredAt"`
}
type RecentEvent struct {
	Event
	ReceivedAt time.Time `json:"receivedAt"`
}
type Store struct{ Pool *pgxpool.Pool }

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	c, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	c.MaxConns = 5
	c.ConnConfig.ConnectTimeout = 5 * time.Second
	c.ConnConfig.RuntimeParams["statement_timeout"] = "10000"
	pool, err := pgxpool.NewWithConfig(ctx, c)
	if err != nil {
		return nil, err
	}
	return &Store{pool}, nil
}
func Hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func Secret() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("random source unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b[:])
}
func uuid() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("random source unavailable")
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
func (s *Store) Ready(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, "SELECT 1 FROM users LIMIT 1")
	return err
}
func (s *Store) BeginOAuth(ctx context.Context, state, verifier string) error {
	return s.BeginOAuthReturn(ctx, state, verifier, "/Blog/")
}
func (s *Store) BeginOAuthReturn(ctx context.Context, state, verifier, returnPath string) error {
	_, err := s.Pool.Exec(ctx, "INSERT INTO oauth_attempts(state_hash, verifier, return_path, expires_at) VALUES ($1,$2,$3,now()+interval '10 minutes')", Hash(state), verifier, returnPath)
	return err
}
func (s *Store) ConsumeOAuth(ctx context.Context, state string) (string, error) {
	v, _, err := s.ConsumeOAuthReturn(ctx, state)
	return v, err
}
func (s *Store) ConsumeOAuthReturn(ctx context.Context, state string) (string, string, error) {
	var v, path string
	err := s.Pool.QueryRow(ctx, "DELETE FROM oauth_attempts WHERE state_hash=$1 AND expires_at>now() RETURNING verifier,return_path", Hash(state)).Scan(&v, &path)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return v, path, err
}

// Account, session, replacement revocation and audit event commit together.
func (s *Store) Login(ctx context.Context, identity github.Identity, oldToken string) (string, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	var userID string
	err = tx.QueryRow(ctx, `INSERT INTO users(id,github_id,login,name) VALUES($1,$2,$3,$4)
 ON CONFLICT(github_id) DO UPDATE SET login=EXCLUDED.login,name=EXCLUDED.name RETURNING id::text`, uuid(), identity.ID, identity.Login, identity.Name).Scan(&userID)
	if err != nil {
		return "", err
	}
	token := Secret()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')`, Hash(token), userID); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO user_events(user_id,event_id,name,path,occurred_at) VALUES($1,$2,'login_success','/api/v1/auth/github/callback',now())`, userID, uuid()); err != nil {
		return "", err
	}
	if oldToken != "" {
		if _, err = tx.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", Hash(oldToken)); err != nil {
			return "", err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return token, nil
}
func (s *Store) FindUser(ctx context.Context, token string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `SELECT u.id::text,u.login,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()`, Hash(token)).Scan(&u.ID, &u.Login, &u.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
func (s *Store) Logout(ctx context.Context, token string) error {
	_, err := s.Pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", Hash(token))
	return err
}
func (s *Store) RecordEvents(ctx context.Context, userID string, events []Event) (int64, error) {
	payload, err := json.Marshal(events)
	if err != nil {
		return 0, err
	}
	result, err := s.Pool.Exec(ctx, `INSERT INTO user_events(user_id,event_id,name,path,occurred_at)
 SELECT $1,e."eventId"::uuid,e.name,e.path,e."occurredAt"::timestamptz
 FROM jsonb_to_recordset($2::jsonb) AS e("eventId" text,name text,path text,"occurredAt" text)
 ON CONFLICT(user_id,event_id) DO NOTHING`, userID, string(payload))
	return result.RowsAffected(), err
}
func (s *Store) RecentEvents(ctx context.Context, userID string) ([]RecentEvent, error) {
	rows, err := s.Pool.Query(ctx, `SELECT event_id::text,name,path,occurred_at,received_at FROM user_events WHERE user_id=$1 ORDER BY received_at DESC,event_id DESC LIMIT 20`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []RecentEvent{}
	for rows.Next() {
		var e RecentEvent
		if err = rows.Scan(&e.EventID, &e.Name, &e.Path, &e.OccurredAt, &e.ReceivedAt); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
func (s *Store) Cleanup(ctx context.Context) error {
	for _, sql := range []string{"DELETE FROM oauth_attempts WHERE expires_at<=now()", "DELETE FROM sessions WHERE expires_at<=now()", "DELETE FROM trend_connect_codes WHERE expires_at<=now()", "DELETE FROM trend_sessions WHERE expires_at<=now()", "DELETE FROM user_events WHERE received_at<now()-interval '90 days'"} {
		if _, err := s.Pool.Exec(ctx, sql); err != nil {
			return err
		}
	}
	return nil
}
