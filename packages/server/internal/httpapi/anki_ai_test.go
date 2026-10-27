package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/aireview"
	"github.com/Marvel-L/Blog/packages/server/internal/config"
	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"time"
)

func setupAI(t *testing.T) (*fixture, string, config.Config) {
	f := setup(t)
	c := cfg
	c.AIEncryptionKey = base64.StdEncoding.EncodeToString(make([]byte, 32))
	c.AIEncryptionKeyID = "v1"
	c.AIModel = "deepseek-flash"
	f.handler = New(c, f.db, func(context.Context, string, string) (github.Identity, error) { return f.identity, nil })
	return f, f.login(t, ""), c
}
func aiCard(t *testing.T, f *fixture, cookie string) store.AnkiCard {
	t.Helper()
	var category store.AnkiCategory
	response := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"Golang"}`)
	requireStatus(t, response, 200)
	decode(t, response.Body.String(), &category)
	var deck store.AnkiDeck
	response = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category.ID+`","name":"面试"}`)
	requireStatus(t, response, 200)
	decode(t, response.Body.String(), &deck)
	var card store.AnkiCard
	response = f.anki(t, "POST", "/api/v1/anki/decks/"+deck.ID+"/cards", cookie, `{"question":"谁关闭 channel","answer":"发送者关闭"}`)
	requireStatus(t, response, 200)
	decode(t, response.Body.String(), &card)
	return card
}
func aiCreate(t *testing.T, f *fixture, cookie string, card store.AnkiCard, mutation string) store.AICheck {
	t.Helper()
	response := f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, fmt.Sprintf(`{"version":%d,"mutationId":"%s"}`, card.Version, mutation))
	requireStatus(t, response, 202)
	var value struct {
		Check store.AICheck `json:"check"`
	}
	decode(t, response.Body.String(), &value)
	return value.Check
}
func TestAIKeySurvivesLogoutAndRelogin(t *testing.T) {
	f, cookie, cfgAI := setupAI(t)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-persistent-private-key"}`), 200)
	var user string
	if err := f.db.Pool.QueryRow(ctx, `SELECT user_id::text FROM anki_ai_settings`).Scan(&user); err != nil {
		t.Fatal(err)
	}
	before, err := f.db.AIKey(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/ai/settings", cookie, ""), 401)
	// New API instance and new OAuth session must restore the same account's saved key.
	f.handler = New(cfgAI, f.db, func(context.Context, string, string) (github.Identity, error) { return f.identity, nil })
	secondCookie := f.login(t, "")
	response := f.anki(t, "GET", "/api/v1/anki/ai/settings", secondCookie, "")
	requireStatus(t, response, 200)
	var settings store.AISettings
	decode(t, response.Body.String(), &settings)
	if !settings.Configured || !settings.Available || strings.Contains(response.Body.String(), "test-persistent-private-key") {
		t.Fatal("configuration not safely restored")
	}
	after, err := f.db.AIKey(ctx, user)
	if err != nil || before.Version != after.Version || string(before.Ciphertext) != string(after.Ciphertext) || string(before.Nonce) != string(after.Nonce) {
		t.Fatal("login changed persisted key")
	}
	cipher, err := deepseek.NewCipher(cfgAI.AIEncryptionKey)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := cipher.Decrypt(user, after.Version, after.Ciphertext, after.Nonce)
	if err != nil || plain != "test-persistent-private-key" {
		t.Fatal("saved key no longer decrypts")
	}
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	response = f.anki(t, "GET", "/api/v1/anki/ai/settings", bob, "")
	requireStatus(t, response, 200)
	decode(t, response.Body.String(), &settings)
	if settings.Configured {
		t.Fatal("another account inherited key")
	}
}

func TestAIRealPersistenceAndSnapshot(t *testing.T) {
	f, cookie, _ := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/ai/settings", "", ""), 401)
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, `{"version":1,"mutationId":"`+mustUUID()+`"}`), 400)
	key := "test-private-deepseek-key"
	response := f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"`+key+`"}`)
	requireStatus(t, response, 200)
	if strings.Contains(response.Body.String(), key) {
		t.Fatal("key leaked in response")
	}
	var encrypted []byte
	var user string
	if err := f.db.Pool.QueryRow(ctx, `SELECT user_id::text,api_key_ciphertext FROM anki_ai_settings`).Scan(&user, &encrypted); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encrypted), key) {
		t.Fatal("plaintext stored")
	}
	first := aiCreate(t, f, cookie, card, mustUUID())
	if first.Status != "queued" || first.Question != card.Question || first.Answer != card.Answer || first.Score != nil {
		t.Fatal("wrong snapshot")
	}
	replay := aiCreate(t, f, cookie, card, mustUUID())
	if replay.ID != first.ID {
		t.Fatal("duplicate create")
	}
	before, _ := json.Marshal(card)
	job, err := f.db.ClaimAICheck(ctx)
	if err != nil || job == nil || job.ID != first.ID {
		t.Fatal("claim failed", err)
	}
	result, err := deepseek.ParseResult(`{"score":72,"summary":"方向正确","strengths":[],"issues":[],"suggestions":["补充条件"]}`)
	if err != nil {
		t.Fatal(err)
	}
	completion := deepseek.Completion{Content: `{"score":72}`, Result: result, Model: "fixture-model"}
	if err = f.db.FinishAICheck(ctx, *job, &completion, ""); err != nil {
		t.Fatal(err)
	}
	persisted, err := f.db.GetAICheck(ctx, user, first.ID)
	if err != nil || persisted.Score == nil || *persisted.Score != 72 || persisted.Result == nil {
		t.Fatal("result not persisted", err)
	}
	cards, err := f.db.ListAnkiCards(ctx, user, card.DeckID)
	if err != nil {
		t.Fatal(err)
	}
	after, _ := json.Marshal(cards[0])
	if string(before) != string(after) {
		t.Fatal("AI changed card schedule/data")
	}
	var stats int
	if err = f.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM anki_reviews").Scan(&stats); err != nil || stats != 0 {
		t.Fatal("AI counted as review")
	}
	updated, err := f.db.UpdateAnkiCard(ctx, user, card.ID, "", "new question", "new answer", false, 1)
	if err != nil {
		t.Fatal(err)
	}
	replay = aiCreate(t, f, cookie, card, mustUUID())
	if replay.ID != first.ID {
		t.Fatal("replay after edit failed")
	}
	second := aiCreate(t, f, cookie, updated, "315fc762-613d-4b27-bef1-900686b00002")
	if second.ID == first.ID {
		t.Fatal("independent checks merged")
	}
	list, err := f.db.ListAIChecks(ctx, user, card.ID, 1, "")
	if err != nil || len(list.Checks) != 1 || list.NextCursor == "" {
		t.Fatal("pagination failed", err)
	}
	next, err := f.db.ListAIChecks(ctx, user, card.ID, 1, list.NextCursor)
	if err != nil || len(next.Checks) != 1 || next.Checks[0].ID == list.Checks[0].ID {
		t.Fatal("cursor failed", err)
	}
	requireStatus(t, f.anki(t, "DELETE", "/api/v1/anki/ai-checks/"+first.ID, cookie, ""), 204)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/ai-checks/"+first.ID, cookie, ""), 404)
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, `{"version":1,"mutationId":"`+mustUUID()+`"}`), 410)
	var q, a, prompt, output *string
	if err = f.db.Pool.QueryRow(ctx, `SELECT question_snapshot,answer_snapshot,user_prompt_snapshot,assistant_content FROM anki_ai_checks WHERE id=$1`, first.ID).Scan(&q, &a, &prompt, &output); err != nil || q != nil || a != nil || prompt != nil || output != nil {
		t.Fatal("deleted content retained")
	}
	if _, err = f.db.GetAICheck(ctx, user, second.ID); err != nil {
		t.Fatal("deletion affected other record")
	}
	requireStatus(t, f.anki(t, "DELETE", "/api/v1/anki/ai/settings", cookie, ""), 204)
	if _, err = f.db.GetAICheck(ctx, user, second.ID); err != nil {
		t.Fatal("key deletion removed history")
	}
}
func TestAIIsolationValidationAndConcurrentCreate(t *testing.T) {
	f, cookie, cfgAI := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-private-key"}`), 200)
	for _, payload := range []string{`{"apiKey":"key","apiKey":"otherkey"}`, `{"apiKey":"test-private-key","userId":"bob"}`, `{"apiKey":null}`, `{"apiKey":"key\nheader"}`} {
		requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, payload), 400)
	}
	for _, payload := range []string{`{"version":1,"mutationId":"` + mustUUID() + `","score":100}`, `{"version":1,"mutationId":"` + mustUUID() + `","messages":[]}`, `{"version":1,"version":2,"mutationId":"` + mustUUID() + `"}`} {
		requireStatus(t, f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, payload), 400)
	}
	var group sync.WaitGroup
	ids := make(chan string, 2)
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			r := f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, `{"version":1,"mutationId":"`+mustUUID()+`"}`)
			codes <- r.Code
			var value struct {
				Check store.AICheck `json:"check"`
			}
			_ = json.Unmarshal(r.Body.Bytes(), &value)
			ids <- value.Check.ID
		}()
	}
	group.Wait()
	close(ids)
	close(codes)
	for code := range codes {
		if code != 202 {
			t.Fatal("concurrent create failed", code)
		}
	}
	id := ""
	for value := range ids {
		if id == "" {
			id = value
		} else if id != value {
			t.Fatal("concurrent duplicate")
		}
	}
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/cards/"+card.ID+"/ai-checks", cookie, `{"version":2,"mutationId":"`+mustUUID()+`"}`), 409)
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	f.handler = New(cfgAI, f.db, func(context.Context, string, string) (github.Identity, error) { return f.identity, nil })
	bob := f.login(t, "")
	for _, path := range []string{"/api/v1/anki/ai-checks/" + id, "/api/v1/anki/cards/" + card.ID + "/ai-checks"} {
		requireStatus(t, f.anki(t, "GET", path, bob, ""), 404)
	}
	requireStatus(t, f.anki(t, "DELETE", "/api/v1/anki/ai-checks/"+id, bob, ""), 404)
	job, err := f.db.ClaimAICheck(ctx)
	if err != nil || job == nil {
		t.Fatal(err)
	}
	requireStatus(t, f.anki(t, "DELETE", "/api/v1/anki/ai-checks/"+id, cookie, ""), 204)
	if err = f.db.FinishAICheck(ctx, *job, &deepseek.Completion{Content: "late", Result: deepseek.Result{Score: 100, Summary: "late", Strengths: []string{}, Issues: []string{}, Suggestions: []string{"late"}}}, ""); err != nil {
		t.Fatal(err)
	}
	if _, err = f.db.GetAICheck(ctx, job.UserID, id); !errors.Is(err, store.ErrAnkiNotFound) {
		t.Fatal("worker resurrected deleted record")
	}
}

type workerChecker func(context.Context, string, string, string, string) (deepseek.Completion, error)

func (f workerChecker) Check(ctx context.Context, key, model, system, prompt string) (deepseek.Completion, error) {
	return f(ctx, key, model, system, prompt)
}
func TestAIWorkerRunsOnceAndPersistsFailure(t *testing.T) {
	f, cookie, cfgAI := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-private-key"}`), 200)
	created := aiCreate(t, f, cookie, card, mustUUID())
	jobUser := ""
	if err := f.db.Pool.QueryRow(ctx, `SELECT user_id::text FROM anki_ai_checks WHERE id=$1`, created.ID).Scan(&jobUser); err != nil {
		t.Fatal(err)
	}
	cipher, err := deepseek.NewCipher(cfgAI.AIEncryptionKey)
	if err != nil {
		t.Fatal(err)
	}
	calls := make(chan string, 4)
	worker := aireview.Worker{DB: f.db, Cipher: cipher, KeyID: "v1", Client: workerChecker(func(ctx context.Context, key, model, system, prompt string) (deepseek.Completion, error) {
		calls <- prompt
		return deepseek.Completion{}, &deepseek.Error{Code: "AI_TIMEOUT"}
	})}
	runCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() { defer close(done); worker.Run(runCtx) }()
	defer func() { cancel(); <-done }()
	select {
	case prompt := <-calls:
		if !strings.Contains(prompt, card.Question) || !strings.Contains(prompt, card.Answer) {
			t.Fatal("wrong prompt")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("worker did not call")
	}
	deadline := time.Now().Add(4 * time.Second)
	for {
		value, err := f.db.GetAICheck(ctx, jobUser, created.ID)
		if err != nil {
			t.Fatal(err)
		}
		if value.Status == "unknown" {
			if value.Score != nil || value.ErrorCode == nil || *value.ErrorCode != "AI_TIMEOUT" {
				t.Fatal("invalid failure")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("worker did not persist")
		}
		time.Sleep(10 * time.Millisecond)
	}
	select {
	case <-calls:
		t.Fatal("worker automatically retried")
	case <-time.After(1200 * time.Millisecond):
	}
	aiCreate(t, f, cookie, card, mustUUID())
	select {
	case <-calls:
		t.Fatal("replay invoked model")
	case <-time.After(1200 * time.Millisecond):
	}
}
func TestAIQueueLeaseAndKeyVersion(t *testing.T) {
	f, cookie, _ := setupAI(t)
	card := aiCard(t, f, cookie)
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"test-private-key"}`), 200)
	created := aiCreate(t, f, cookie, card, mustUUID())
	job, err := f.db.ClaimAICheck(ctx)
	if err != nil || job == nil {
		t.Fatal(err)
	}
	jobUser := job.UserID
	if _, err = f.db.Pool.Exec(ctx, `UPDATE anki_ai_checks SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`, created.ID); err != nil {
		t.Fatal(err)
	}
	if next, err := f.db.ClaimAICheck(ctx); err != nil || next != nil {
		t.Fatal("expired running was retried", err)
	}
	value, err := f.db.GetAICheck(ctx, jobUser, created.ID)
	if err != nil || value.Status != "unknown" {
		t.Fatal("lease did not become unknown")
	}
	late := deepseek.Completion{Content: "late", Result: deepseek.Result{Score: 100, Summary: "late", Strengths: []string{}, Issues: []string{}, Suggestions: []string{"late"}}}
	if err = f.db.FinishAICheck(ctx, *job, &late, ""); err != nil {
		t.Fatal(err)
	}
	value, _ = f.db.GetAICheck(ctx, jobUser, created.ID)
	if value.Status != "unknown" {
		t.Fatal("old claim changed terminal status")
	}
	second := aiCreate(t, f, cookie, card, "315fc762-613d-4b27-bef1-900686b00002")
	requireStatus(t, f.anki(t, "PUT", "/api/v1/anki/ai/settings", cookie, `{"apiKey":"replacement-key"}`), 200)
	value, err = f.db.GetAICheck(ctx, jobUser, second.ID)
	if err != nil || value.Status != "failed" || value.ErrorCode == nil || *value.ErrorCode != "AI_KEY_CHANGED" {
		t.Fatal("key update did not cancel queued")
	}
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/cards/"+card.ID+"/ai-checks?cursor=bad", cookie, ""), 400)
}
