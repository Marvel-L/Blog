package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/jackc/pgx/v5"
)

var (
	ErrAIUnavailable   = errors.New("AI_UNAVAILABLE")
	ErrAINotConfigured = errors.New("AI_NOT_CONFIGURED")
	ErrAIActive        = errors.New("AI_CHECK_RUNNING")
	ErrAIRateLimited   = errors.New("AI_RATE_LIMITED")
	ErrAIDeleted       = errors.New("AI_CHECK_DELETED")
	ErrAICursor        = errors.New("AI_CURSOR_INVALID")
)

type AISettings struct {
	Configured bool       `json:"configured"`
	MaskedKey  string     `json:"maskedKey"`
	UpdatedAt  *time.Time `json:"updatedAt"`
	Available  bool       `json:"available"`
}
type AIKey struct {
	Ciphertext, Nonce []byte
	Version           int64
	KeyID             string
}
type AICheck struct {
	ID               string           `json:"id"`
	CardID           string           `json:"cardId"`
	CardVersion      int              `json:"cardVersion"`
	Status           string           `json:"status"`
	Question         string           `json:"questionSnapshot,omitempty"`
	Answer           string           `json:"answerSnapshot,omitempty"`
	SystemPrompt     string           `json:"systemPromptSnapshot,omitempty"`
	UserPrompt       string           `json:"userPromptSnapshot,omitempty"`
	PromptVersion    string           `json:"promptVersion"`
	Model            string           `json:"model"`
	ModelReturned    *string          `json:"modelReturned,omitempty"`
	AssistantContent *string          `json:"assistantContent,omitempty"`
	Result           *deepseek.Result `json:"result,omitempty"`
	Score            *int             `json:"score"`
	ErrorCode        *string          `json:"errorCode,omitempty"`
	CreatedAt        time.Time        `json:"createdAt"`
	StartedAt        *time.Time       `json:"startedAt,omitempty"`
	FinishedAt       *time.Time       `json:"finishedAt,omitempty"`
	UserID           string           `json:"-"`
	KeyVersion       int64            `json:"-"`
	ClaimToken       string           `json:"-"`
}
type AICheckList struct {
	Checks     []AICheck `json:"checks"`
	NextCursor string    `json:"nextCursor"`
	Active     *AICheck  `json:"active,omitempty"`
}

const aiColumns = `id::text,user_id::text,card_id::text,card_version,status,COALESCE(question_snapshot,''),COALESCE(answer_snapshot,''),COALESCE(system_prompt_snapshot,''),COALESCE(user_prompt_snapshot,''),prompt_version,model_requested,model_returned,assistant_content,result,score,error_code,created_at,started_at,finished_at,key_version,COALESCE(claim_token::text,'')`
const aiSummaryColumns = `id::text,user_id::text,card_id::text,card_version,status,''::text,''::text,''::text,''::text,prompt_version,model_requested,model_returned,NULL::text,NULL::jsonb,score,error_code,created_at,started_at,finished_at,key_version,''::text`

func scanAI(row pgx.Row) (AICheck, error) {
	var c AICheck
	var raw []byte
	err := row.Scan(&c.ID, &c.UserID, &c.CardID, &c.CardVersion, &c.Status, &c.Question, &c.Answer, &c.SystemPrompt, &c.UserPrompt, &c.PromptVersion, &c.Model, &c.ModelReturned, &c.AssistantContent, &raw, &c.Score, &c.ErrorCode, &c.CreatedAt, &c.StartedAt, &c.FinishedAt, &c.KeyVersion, &c.ClaimToken)
	if err == nil && len(raw) > 0 {
		var result deepseek.Result
		if json.Unmarshal(raw, &result) != nil {
			return c, errors.New("invalid stored AI result")
		}
		c.Result = &result
	}
	return c, err
}
func (s *Store) AISettings(ctx context.Context, user string) (AISettings, error) {
	var out AISettings
	var t time.Time
	err := s.Pool.QueryRow(ctx, `SELECT api_key_ciphertext IS NOT NULL,masked_key,updated_at FROM anki_ai_settings WHERE user_id=$1`, user).Scan(&out.Configured, &out.MaskedKey, &t)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err == nil {
		out.UpdatedAt = &t
	}
	return out, err
}
func (s *Store) SetAIKey(ctx context.Context, user, key, keyID string, c *deepseek.Cipher) (AISettings, error) {
	if c == nil {
		return AISettings{}, ErrAIUnavailable
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AISettings{}, err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, user); err != nil {
		return AISettings{}, err
	}
	var version int64
	err = tx.QueryRow(ctx, "SELECT version FROM anki_ai_settings WHERE user_id=$1", user).Scan(&version)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return AISettings{}, err
	}
	version++
	value, nonce, err := c.Encrypt(user, version, key)
	if err != nil {
		return AISettings{}, err
	}
	var updated time.Time
	err = tx.QueryRow(ctx, `INSERT INTO anki_ai_settings(user_id,api_key_ciphertext,nonce,encryption_key_id,masked_key,version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET api_key_ciphertext=$2,nonce=$3,encryption_key_id=$4,masked_key=$5,version=$6,updated_at=clock_timestamp() RETURNING updated_at`, user, value, nonce, keyID, deepseek.MaskKey(key), version).Scan(&updated)
	if err != nil {
		return AISettings{}, err
	}
	_, err = tx.Exec(ctx, `UPDATE anki_ai_checks SET status='failed',error_code='AI_KEY_CHANGED',finished_at=clock_timestamp() WHERE user_id=$1 AND status='queued'`, user)
	if err != nil {
		return AISettings{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AISettings{}, err
	}
	return AISettings{true, deepseek.MaskKey(key), &updated, true}, nil
}
func (s *Store) DeleteAIKey(ctx context.Context, user string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, user); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE anki_ai_settings SET api_key_ciphertext=NULL,nonce=NULL,masked_key='',version=version+1,updated_at=clock_timestamp() WHERE user_id=$1`, user)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE anki_ai_checks SET status='failed',error_code='AI_KEY_REMOVED',finished_at=clock_timestamp() WHERE user_id=$1 AND status='queued'`, user)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *Store) AIKey(ctx context.Context, user string) (AIKey, error) {
	var key AIKey
	err := s.Pool.QueryRow(ctx, `SELECT api_key_ciphertext,nonce,version,encryption_key_id FROM anki_ai_settings WHERE user_id=$1 AND api_key_ciphertext IS NOT NULL`, user).Scan(&key.Ciphertext, &key.Nonce, &key.Version, &key.KeyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return key, ErrAINotConfigured
	}
	return key, err
}
func (s *Store) CreateAICheck(ctx context.Context, user, card string, version int, mutation, model string) (AICheck, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AICheck{}, err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, user); err != nil {
		return AICheck{}, err
	}
	digest := Hash(fmt.Sprintf("%s:%d:%s:%s", card, version, model, deepseek.PromptVersion))
	var priorHash, id string
	err = tx.QueryRow(ctx, `SELECT request_hash,check_id::text FROM anki_ai_request_receipts WHERE user_id=$1 AND mutation_id=$2`, user, mutation).Scan(&priorHash, &id)
	if err == nil {
		if priorHash != digest {
			return AICheck{}, ErrMutationReuse
		}
		c, e := scanAI(tx.QueryRow(ctx, `SELECT `+aiColumns+` FROM anki_ai_checks WHERE id=$1 AND user_id=$2`, id, user))
		if e != nil {
			return c, e
		}
		if c.Status == "deleted" {
			return c, ErrAIDeleted
		}
		return c, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return AICheck{}, err
	}
	var question, answer, deck string
	var current int
	err = tx.QueryRow(ctx, `SELECT question,answer,deck_id::text,version FROM anki_cards WHERE user_id=$1 AND id=$2 FOR SHARE`, user, card).Scan(&question, &answer, &deck, &current)
	if errors.Is(err, pgx.ErrNoRows) {
		return AICheck{}, ErrAnkiNotFound
	}
	if err != nil {
		return AICheck{}, err
	}
	if current != version {
		return AICheck{}, ErrAnkiVersion
	}
	var keyVersion int64
	err = tx.QueryRow(ctx, `SELECT version FROM anki_ai_settings WHERE user_id=$1 AND api_key_ciphertext IS NOT NULL`, user).Scan(&keyVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return AICheck{}, ErrAINotConfigured
	}
	if err != nil {
		return AICheck{}, err
	}
	var active bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anki_ai_checks WHERE user_id=$1 AND card_id=$2 AND status IN ('queued','running'))`, user, card).Scan(&active)
	if err != nil {
		return AICheck{}, err
	}
	if active {
		return AICheck{}, ErrAIActive
	}
	var recent, queued int
	err = tx.QueryRow(ctx, `SELECT COUNT(*) FILTER(WHERE created_at>clock_timestamp()-interval '1 minute'),COUNT(*) FILTER(WHERE status='queued') FROM anki_ai_checks WHERE user_id=$1`, user).Scan(&recent, &queued)
	if err != nil {
		return AICheck{}, err
	}
	if recent >= 5 || queued >= 5 {
		return AICheck{}, ErrAIRateLimited
	}
	c, err := scanAI(tx.QueryRow(ctx, `INSERT INTO anki_ai_checks(id,user_id,card_id,card_version,deck_id_snapshot,question_snapshot,answer_snapshot,system_prompt_snapshot,user_prompt_snapshot,prompt_version,model_requested,key_version,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'queued') RETURNING `+aiColumns, uuid(), user, card, version, deck, question, answer, deepseek.SystemPrompt, deepseek.UserPrompt(question, answer), deepseek.PromptVersion, model, keyVersion))
	if err != nil {
		return c, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO anki_ai_request_receipts(user_id,mutation_id,request_hash,check_id) VALUES($1,$2,$3,$4)`, user, mutation, digest, c.ID)
	if err != nil {
		return c, err
	}
	return c, tx.Commit(ctx)
}
func (s *Store) GetAICheck(ctx context.Context, user, id string) (AICheck, error) {
	c, err := scanAI(s.Pool.QueryRow(ctx, `SELECT `+aiColumns+` FROM anki_ai_checks WHERE user_id=$1 AND id=$2 AND status<>'deleted'`, user, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrAnkiNotFound
	}
	return c, err
}
func cursorAI(c AICheck) string {
	return base64.RawURLEncoding.EncodeToString([]byte(c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID))
}
func parseAICursor(cursor string) (time.Time, string, error) {
	raw, err := base64.RawURLEncoding.Strict().DecodeString(cursor)
	if err != nil || len(raw) > 100 {
		return time.Time{}, "", ErrAICursor
	}
	p := strings.Split(string(raw), "|")
	if len(p) != 2 || len(p[1]) != 36 {
		return time.Time{}, "", ErrAICursor
	}
	for i, r := range p[1] {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if r != '-' {
				return time.Time{}, "", ErrAICursor
			}
		} else if !strings.ContainsRune("0123456789abcdef", r) {
			return time.Time{}, "", ErrAICursor
		}
	}
	t, err := time.Parse(time.RFC3339Nano, p[0])
	if err != nil {
		return t, "", ErrAICursor
	}
	return t, p[1], nil
}
func (s *Store) ListAIChecks(ctx context.Context, user, card string, limit int, cursor string) (AICheckList, error) {
	out := AICheckList{Checks: []AICheck{}}
	var owned bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anki_cards WHERE user_id=$1 AND id=$2)`, user, card).Scan(&owned)
	if err != nil {
		return out, err
	}
	if !owned {
		return out, ErrAnkiNotFound
	}
	var stamp any
	var id any
	if cursor != "" {
		t, c, e := parseAICursor(cursor)
		if e != nil {
			return out, e
		}
		stamp = t
		id = c
	}
	rows, err := s.Pool.Query(ctx, `SELECT `+aiSummaryColumns+` FROM anki_ai_checks WHERE user_id=$1 AND card_id=$2 AND status<>'deleted' AND ($3::timestamptz IS NULL OR (created_at,id)<($3,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`, user, card, stamp, id, limit+1)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		c, e := scanAI(rows)
		if e != nil {
			return out, e
		}
		c.Question = ""
		c.Answer = ""
		c.SystemPrompt = ""
		c.UserPrompt = ""
		c.AssistantContent = nil
		c.Result = nil
		out.Checks = append(out.Checks, c)
	}
	if err = rows.Err(); err != nil {
		return out, err
	}
	rows.Close()
	if len(out.Checks) > limit {
		out.Checks = out.Checks[:limit]
		out.NextCursor = cursorAI(out.Checks[limit-1])
	}
	active, e := scanAI(s.Pool.QueryRow(ctx, `SELECT `+aiSummaryColumns+` FROM anki_ai_checks WHERE user_id=$1 AND card_id=$2 AND status IN ('queued','running')`, user, card))
	if e == nil {
		active.Question = ""
		active.Answer = ""
		active.SystemPrompt = ""
		active.UserPrompt = ""
		out.Active = &active
	} else if !errors.Is(e, pgx.ErrNoRows) {
		return out, e
	}
	return out, nil
}
func (s *Store) DeleteAICheck(ctx context.Context, user, id string) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE anki_ai_checks SET status='deleted',question_snapshot=NULL,answer_snapshot=NULL,system_prompt_snapshot=NULL,user_prompt_snapshot=NULL,assistant_content=NULL,result=NULL,score=NULL,usage=NULL,error_code=NULL,deleted_at=clock_timestamp(),claim_token=NULL,lease_until=NULL WHERE user_id=$1 AND id=$2`, user, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAnkiNotFound
	}
	return nil
}

// Claim serializes capacity checks across instances and releases its transaction before network IO.
func (s *Store) ClaimAICheck(ctx context.Context) (*AICheck, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(7102027)`); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE anki_ai_checks SET status='unknown',error_code='AI_REQUEST_UNKNOWN',finished_at=clock_timestamp(),claim_token=NULL WHERE status='running' AND lease_until<clock_timestamp()`); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `UPDATE anki_ai_checks SET status='failed',error_code='AI_QUEUE_EXPIRED',finished_at=clock_timestamp() WHERE status='queued' AND created_at<clock_timestamp()-interval '5 minutes'`); err != nil {
		return nil, err
	}
	var running int
	if err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM anki_ai_checks WHERE status='running'`).Scan(&running); err != nil {
		return nil, err
	}
	if running >= 2 {
		return nil, tx.Commit(ctx)
	}
	c, err := scanAI(tx.QueryRow(ctx, `SELECT `+aiColumns+` FROM anki_ai_checks q WHERE status='queued' AND NOT EXISTS(SELECT 1 FROM anki_ai_checks r WHERE r.user_id=q.user_id AND r.status='running') ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, tx.Commit(ctx)
	}
	if err != nil {
		return nil, err
	}
	c, err = scanAI(tx.QueryRow(ctx, `UPDATE anki_ai_checks SET status='running',claim_token=$2,started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes' WHERE id=$1 AND status='queued' RETURNING `+aiColumns, c.ID, uuid()))
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &c, nil
}
func (s *Store) AIClaimActive(ctx context.Context, c AICheck) (bool, error) {
	var active bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anki_ai_checks WHERE id=$1 AND user_id=$2 AND status='running' AND claim_token=$3)`, c.ID, c.UserID, c.ClaimToken).Scan(&active)
	return active, err
}
func (s *Store) FinishAICheck(ctx context.Context, c AICheck, completion *deepseek.Completion, code string) error {
	if completion == nil {
		status := "failed"
		if code == "AI_TIMEOUT" || code == "AI_REQUEST_UNKNOWN" {
			status = "unknown"
		}
		_, err := s.Pool.Exec(ctx, `UPDATE anki_ai_checks SET status=$4,error_code=$5,finished_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND user_id=$2 AND claim_token=$3 AND status='running'`, c.ID, c.UserID, c.ClaimToken, status, code)
		return err
	}
	raw, err := json.Marshal(completion.Result)
	if err != nil {
		return err
	}
	usage := completion.Usage
	if len(usage) == 0 {
		usage = json.RawMessage("null")
	}
	_, err = s.Pool.Exec(ctx, `UPDATE anki_ai_checks SET status='succeeded',assistant_content=$4,result=$5::jsonb,score=$6,model_returned=$7,usage=$8::jsonb,finished_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND user_id=$2 AND claim_token=$3 AND status='running'`, c.ID, c.UserID, c.ClaimToken, completion.Content, string(raw), completion.Result.Score, completion.Model, string(usage))
	return err
}
func (s *Store) CleanupAI(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM anki_ai_request_receipts WHERE expires_at<clock_timestamp()`)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `DELETE FROM anki_ai_checks c WHERE status='deleted' AND deleted_at<clock_timestamp()-interval '24 hours' AND NOT EXISTS(SELECT 1 FROM anki_ai_request_receipts r WHERE r.check_id=c.id)`)
	return err
}

// Exposed helper validates pagination before SQL.
func AIPageLimit(raw string) (int, error) {
	if raw == "" {
		return 20, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 1 || v > 50 {
		return 0, ErrAICursor
	}
	return v, nil
}
