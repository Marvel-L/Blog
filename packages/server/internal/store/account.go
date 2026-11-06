package store

import (
	"context"
	"errors"
	"strings"

	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/jackc/pgx/v5"
)

type OAuthAttempt struct{ Verifier, ReturnPath, BindingSessionHash string }

func (s *Store) BeginOAuthBinding(ctx context.Context, state, verifier, returnPath, session string) error {
	result, err := s.Pool.Exec(ctx, `INSERT INTO oauth_attempts(state_hash,verifier,return_path,binding_session_hash,expires_at)
 SELECT $1,$2,$3,s.token_hash,now()+interval '10 minutes' FROM sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=$4 AND s.expires_at>now() AND u.github_id IS NULL`, Hash(state), verifier, returnPath, Hash(session))
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrAccountConflict
	}
	return nil
}
func (s *Store) ConsumeOAuthAttempt(ctx context.Context, state string) (OAuthAttempt, error) {
	var a OAuthAttempt
	err := s.Pool.QueryRow(ctx, `DELETE FROM oauth_attempts WHERE state_hash=$1 AND expires_at>now()
 RETURNING verifier,return_path,COALESCE(binding_session_hash,'')`, Hash(state)).Scan(&a.Verifier, &a.ReturnPath, &a.BindingSessionHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, nil
	}
	return a, err
}
func accountLock(ctx context.Context, tx pgx.Tx) error {
	// Login, credential attachment and binding share a lock; no split identities under races.
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(7102027)")
	return err
}
func sessionInTx(ctx context.Context, tx pgx.Tx, userID, oldToken, path string, revokeAll bool) (string, error) {
	if revokeAll {
		if _, err := tx.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1", userID); err != nil {
			return "", err
		}
	} else if oldToken != "" {
		if _, err := tx.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", Hash(oldToken)); err != nil {
			return "", err
		}
	}
	token := Secret()
	if _, err := tx.Exec(ctx, `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')`, Hash(token), userID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_events(user_id,event_id,name,path,occurred_at) VALUES($1,$2,'login_success',$3,now())`, userID, uuid(), path); err != nil {
		return "", err
	}
	return token, nil
}
func (s *Store) allowAccountAttempt(ctx context.Context, username string) (bool, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `INSERT INTO account_login_limits(account_hash,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
 ON CONFLICT(account_hash) DO UPDATE SET attempts=CASE WHEN account_login_limits.expires_at<=now() THEN 1 ELSE account_login_limits.attempts+1 END,
 expires_at=CASE WHEN account_login_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE account_login_limits.expires_at END RETURNING attempts`, Hash(strings.ToLower(username))).Scan(&n)
	return n <= 10, err
}
func (s *Store) RegisterAccount(ctx context.Context, username, password, oldToken string) (string, error) {
	if !ValidUsername(username) || !ValidPassword(password) {
		return "", ErrCredentials
	}
	encoded, err := PasswordHash(password)
	if err != nil {
		return "", err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if err = accountLock(ctx, tx); err != nil {
		return "", err
	}
	var exists bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM account_credentials WHERE lower(username)=lower($1))", username).Scan(&exists); err != nil {
		return "", err
	}
	if exists {
		return "", ErrAccountConflict
	}
	id := uuid()
	if _, err = tx.Exec(ctx, "INSERT INTO users(id,github_id,login,name) VALUES($1,NULL,$2,$2)", id, username); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO account_credentials(user_id,username,password_hash) VALUES($1,$2,$3)", id, username, encoded); err != nil {
		return "", err
	}
	token, err := sessionInTx(ctx, tx, id, oldToken, "/api/v1/auth/account/register", false)
	if err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return token, nil
}
func (s *Store) LoginAccount(ctx context.Context, username, password, oldToken string) (string, error) {
	allowed, err := s.allowAccountAttempt(ctx, username)
	if err != nil {
		return "", err
	}
	if !allowed {
		return "", ErrCredentials
	}
	var id, encoded string
	err = s.Pool.QueryRow(ctx, "SELECT user_id::text,password_hash FROM account_credentials WHERE lower(username)=lower($1)", username).Scan(&id, &encoded)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	verified := VerifyPassword(encoded, password)
	if !verified || id == "" {
		return "", ErrCredentials
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if err = accountLock(ctx, tx); err != nil {
		return "", err
	}
	// Re-read after verification to prevent an in-flight login using a moved credential.
	var currentID, currentHash string
	if err = tx.QueryRow(ctx, "SELECT user_id::text,password_hash FROM account_credentials WHERE lower(username)=lower($1) FOR UPDATE", username).Scan(&currentID, &currentHash); err != nil {
		return "", ErrCredentials
	}
	if currentID != id || currentHash != encoded {
		return "", ErrCredentials
	}
	token, err := sessionInTx(ctx, tx, id, oldToken, "/api/v1/auth/account/login", false)
	if err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return token, nil
}
func unboundHasData(ctx context.Context, tx pgx.Tx, id string) (bool, error) {
	var exists bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM monthly_planners WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM planner_daily WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM trend_dashboards WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_categories WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_decks WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_cards WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_reviews WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_daily_stats WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_goals WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_ai_settings WHERE user_id=$1)
 OR EXISTS(SELECT 1 FROM anki_ai_checks WHERE user_id=$1)`, id).Scan(&exists)
	return exists, err
}
func moveUnboundCredential(ctx context.Context, tx pgx.Tx, source, target string) error {
	exists, err := unboundHasData(ctx, tx, source)
	if err != nil {
		return err
	}
	if exists {
		return ErrUnboundData
	}
	if _, err = tx.Exec(ctx, `UPDATE account_credentials SET user_id=$2 WHERE user_id=$1`, source, target); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO user_events(user_id,event_id,name,path,occurred_at,received_at)
 SELECT $2,event_id,name,path,occurred_at,received_at FROM user_events WHERE user_id=$1 ON CONFLICT DO NOTHING`, source, target); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "DELETE FROM users WHERE id=$1 AND github_id IS NULL", source)
	return err
}
func (s *Store) BindGitHub(ctx context.Context, identity github.Identity, sessionHash string) (string, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if err = accountLock(ctx, tx); err != nil {
		return "", err
	}
	var source string
	var githubID *string
	err = tx.QueryRow(ctx, `SELECT u.id::text,u.github_id FROM users u JOIN sessions s ON s.user_id=u.id
 WHERE s.token_hash=$1 AND s.expires_at>now() FOR UPDATE OF u`, sessionHash).Scan(&source, &githubID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrCredentials
	}
	if err != nil {
		return "", err
	}
	if githubID != nil {
		return "", ErrAccountConflict
	}
	var target string
	err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE github_id=$1 FOR UPDATE", identity.ID).Scan(&target)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if target == "" {
		exists, e := unboundHasData(ctx, tx, source)
		if e != nil {
			return "", e
		}
		if exists {
			return "", ErrUnboundData
		}
		if _, err = tx.Exec(ctx, "UPDATE users SET github_id=$2,login=$3,name=$4 WHERE id=$1", source, identity.ID, identity.Login, identity.Name); err != nil {
			return "", err
		}
		target = source
	} else {
		var has bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM account_credentials WHERE user_id=$1)", target).Scan(&has); err != nil {
			return "", err
		}
		if has {
			return "", ErrAccountConflict
		}
		if err = moveUnboundCredential(ctx, tx, source, target); err != nil {
			return "", err
		}
	}
	token, err := sessionInTx(ctx, tx, target, "", "/api/v1/auth/github/bind", true)
	if err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return token, nil
}

// A GitHub-authenticated browser attaches a new system credential or proves an
// existing unbound credential. Supplying another person's username is insufficient.
func (s *Store) BindAccount(ctx context.Context, session, username, password string) (string, error) {
	allowed, err := s.allowAccountAttempt(ctx, username)
	if err != nil {
		return "", err
	}
	if !allowed {
		return "", ErrCredentials
	}
	var source, encoded string
	err = s.Pool.QueryRow(ctx, "SELECT user_id::text,password_hash FROM account_credentials WHERE lower(username)=lower($1)", username).Scan(&source, &encoded)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if source != "" {
		if !VerifyPassword(encoded, password) {
			return "", ErrCredentials
		}
	} else {
		encoded, err = PasswordHash(password)
		if err != nil {
			return "", err
		}
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(context.Background())
	if err = accountLock(ctx, tx); err != nil {
		return "", err
	}
	var target string
	err = tx.QueryRow(ctx, `SELECT u.id::text FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.github_id IS NOT NULL FOR UPDATE OF u`, Hash(session)).Scan(&target)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrCredentials
	}
	if err != nil {
		return "", err
	}
	var has bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM account_credentials WHERE user_id=$1)", target).Scan(&has); err != nil {
		return "", err
	}
	if has {
		return "", ErrAccountConflict
	}
	var currentID, currentHash string
	err = tx.QueryRow(ctx, `SELECT c.user_id::text,c.password_hash FROM account_credentials c JOIN users u ON u.id=c.user_id
 WHERE lower(c.username)=lower($1) AND u.github_id IS NULL FOR UPDATE OF c,u`, username).Scan(&currentID, &currentHash)
	if source == "" {
		// Check the full namespace, including already linked credentials.
		var exists bool
		if e := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM account_credentials WHERE lower(username)=lower($1))", username).Scan(&exists); e != nil {
			return "", e
		}
		if exists {
			return "", ErrAccountConflict
		}
		if _, err = tx.Exec(ctx, "INSERT INTO account_credentials(user_id,username,password_hash) VALUES($1,$2,$3)", target, username, encoded); err != nil {
			return "", err
		}
	} else {
		if err != nil || currentID != source || currentHash != encoded {
			return "", ErrAccountConflict
		}
		if err = moveUnboundCredential(ctx, tx, source, target); err != nil {
			return "", err
		}
	}
	token, err := sessionInTx(ctx, tx, target, "", "/api/v1/auth/account/bind", true)
	if err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return token, nil
}

// Offline administration: a fixed GitHub numeric ID is required, not a client
// supplied username. No overwrite, password rotation or duplicate identity.
func (s *Store) InitializeAccount(ctx context.Context, username, encoded, githubID string) error {
	if !ValidUsername(username) || !ValidPasswordHash(encoded) || githubID == "" {
		return ErrCredentials
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err = accountLock(ctx, tx); err != nil {
		return err
	}
	var id string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE github_id=$1 FOR UPDATE", githubID).Scan(&id); err != nil {
		return err
	}
	var exists bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM account_credentials WHERE user_id=$1 OR lower(username)=lower($2))", id, username).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return ErrAccountConflict
	}
	if _, err = tx.Exec(ctx, "INSERT INTO account_credentials(user_id,username,password_hash) VALUES($1,$2,$3)", id, username, encoded); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
