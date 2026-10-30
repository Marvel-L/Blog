package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/aireview"
	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func TestAIDiagnosticPersistenceIsolationDeletionAndOldRecords(t *testing.T) {
	f, cookie, _ := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-private-key"}`), 200)
	created := aiCreate(t, f, cookie, card, mustUUID())
	job, err := f.db.ClaimAICheck(ctx)
	if err != nil || job == nil {
		t.Fatal("claim failed", err)
	}
	diagnostic := &deepseek.Diagnostic{Stage: "result_validation", Detail: "score 必须是 0–100 的整数。", HTTPStatus: 200, RequestID: "request-fixture", ResponseReceived: true, ResponseComplete: true, ResponseBody: `{"choices":[{"message":{"content":"invalid score"}}]}`, Usage: &deepseek.TokenUsage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15}}
	if err = f.db.FinishAICheckDiagnostic(ctx, *job, nil, "AI_RESULT_INVALID", diagnostic); err != nil {
		t.Fatal(err)
	}
	persisted, err := f.db.GetAICheck(ctx, job.UserID, created.ID)
	if err != nil || persisted.Status != "failed" || persisted.Score != nil || persisted.Result != nil || persisted.Diagnostic == nil || persisted.Diagnostic.ResponseBody != diagnostic.ResponseBody {
		t.Fatal("failure diagnostic lost or scored", err)
	}
	response := f.anki(t, "GET", "/api/v1/anki/ai-checks/"+created.ID, cookie, "")
	requireStatus(t, response, 200)
	if !strings.Contains(response.Body.String(), "diagnostic") || !strings.Contains(response.Body.String(), "invalid score") || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private detail missing or cached")
	}
	list, err := f.db.ListAIChecks(ctx, job.UserID, card.ID, 20, "")
	if err != nil || len(list.Checks) != 1 || list.Checks[0].Diagnostic != nil {
		t.Fatal("summary leaked diagnostic", err)
	}
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/ai-checks/"+created.ID, bob, ""), 404)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/ai-checks/"+created.ID, "", ""), 401)
	// Identical receipt must remain terminal; neither reads nor replay create work.
	replay := aiCreate(t, f, cookie, card, mustUUID())
	if replay.ID != created.ID || replay.Diagnostic == nil {
		t.Fatal("replay lost diagnostic")
	}
	if next, err := f.db.ClaimAICheck(ctx); err != nil || next != nil {
		t.Fatal("terminal failure retried", err)
	}
	requireStatus(t, f.anki(t, "DELETE", "/api/v1/anki/ai-checks/"+created.ID, cookie, ""), 204)
	var cleared bool
	if err = f.db.Pool.QueryRow(ctx, `SELECT diagnostic IS NULL FROM anki_ai_checks WHERE id=$1`, created.ID).Scan(&cleared); err != nil || !cleared {
		t.Fatal("deleted diagnostic retained", err)
	}
	if err = f.db.FinishAICheckDiagnostic(ctx, *job, nil, "AI_RESULT_INVALID", diagnostic); err != nil {
		t.Fatal(err)
	}
	if _, err = f.db.GetAICheck(ctx, job.UserID, created.ID); !errors.Is(err, store.ErrAnkiNotFound) {
		t.Fatal("late worker resurrected record")
	}
	old := aiCreate(t, f, cookie, card, "315fc762-613d-4b27-bef1-900686b00002")
	oldJob, err := f.db.ClaimAICheck(ctx)
	if err != nil || oldJob == nil {
		t.Fatal(err)
	}
	if err = f.db.FinishAICheck(ctx, *oldJob, nil, "AI_REQUEST_UNKNOWN"); err != nil {
		t.Fatal(err)
	}
	oldValue, err := f.db.GetAICheck(ctx, job.UserID, old.ID)
	if err != nil || oldValue.Diagnostic != nil || oldValue.Status != "unknown" {
		t.Fatal("old record compatibility broken", err)
	}
}

func TestAIWorkerPersistsFailureDiagnosticWithoutRetry(t *testing.T) {
	f, cookie, cfgAI := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-private-key"}`), 200)
	created := aiCreate(t, f, cookie, card, mustUUID())
	var user string
	if err := f.db.Pool.QueryRow(ctx, `SELECT user_id::text FROM anki_ai_checks WHERE id=$1`, created.ID).Scan(&user); err != nil {
		t.Fatal(err)
	}
	cipher, err := deepseek.NewCipher(cfgAI.AIEncryptionKey)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	worker := aireview.Worker{DB: f.db, Cipher: cipher, KeyID: "v1", Client: workerChecker(func(context.Context, string, string, string, string) (deepseek.Completion, error) {
		calls.Add(1)
		return deepseek.Completion{}, &deepseek.Error{Code: "AI_RESULT_INVALID", Diagnostic: &deepseek.Diagnostic{Stage: "result_validation", Detail: "缺少必填字段：score。", HTTPStatus: 200, ResponseReceived: true, ResponseComplete: true, ResponseBody: `{"summary":"fixture"}`}}
	})}
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { defer close(done); worker.Run(runCtx) }()
	defer func() { cancel(); <-done }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		value, err := f.db.GetAICheck(ctx, user, created.ID)
		if err != nil {
			t.Fatal(err)
		}
		if value.Status == "failed" {
			if value.Diagnostic == nil || value.Diagnostic.Detail != "缺少必填字段：score。" || value.Score != nil {
				t.Fatal("worker discarded failure diagnostic")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("worker did not finish")
		}
		time.Sleep(10 * time.Millisecond)
	}
	aiCreate(t, f, cookie, card, mustUUID())
	time.Sleep(1200 * time.Millisecond)
	if calls.Load() != 1 {
		t.Fatal("worker resent request")
	}
	cards, err := f.db.ListAnkiCards(ctx, user, card.DeckID)
	if err != nil {
		t.Fatal(err)
	}
	before, _ := json.Marshal(card)
	after, _ := json.Marshal(cards[0])
	if string(before) != string(after) {
		t.Fatal("diagnostics changed card or schedule")
	}
}
