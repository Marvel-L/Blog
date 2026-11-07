package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const articleState = `{"version":1,"preferences":[{"postId":"go","interest":"want","reviewInterval":0,"reviewFrom":null}],"events":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","postId":"go","day":"2026-11-07","undone":false}]}`
const articleStateV2 = `{"version":2,"preferences":[{"postId":"go","interest":"seen"}],"events":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","postId":"go","day":"2026-11-07","undone":false,"previousInterest":"want"}]}`
const articlePath = "/api/v1/articles/reading"

func TestArticleReadingPersistenceIsolationAndReplay(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	requireStatus(t, f.request("GET", articlePath, "", "", ""), 401)
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", articleState)
	requireStatus(t, f.request("PUT", articlePath, "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", articlePath, cookie, body, "https://evil.example"), 403)
	requireStatus(t, f.request("PUT", articlePath, cookie, body, ""), 403)
	w := f.request("PUT", articlePath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User    store.User
		Reading store.ArticleReadingSnapshot
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Reading.Revision != 1 || response.Reading.UpdatedAt == nil || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("save not confirmed or cacheable")
	}
	requireStatus(t, f.request("PUT", articlePath, cookie, body, cfg.Origin), 200)
	got, err := f.db.ArticleReading(ctx, response.User.ID)
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), `"want"`) {
		t.Fatal("real SQL persistence failed")
	}
	requireStatus(t, f.request("PUT", articlePath, cookie, strings.Replace(body, `"want"`, `"skip"`, 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(0, "22222222-2222-4222-8222-222222222222", articleState), cfg.Origin), 409)
	changed := strings.Replace(articleState, `"want"`, `"skip"`, 1)
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", changed), cfg.Origin), 200)
	// A replay of an older successful write must return the latest state without reverting it.
	w = f.request("PUT", articlePath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":2`) || !strings.Contains(w.Body.String(), `"skip"`) {
		t.Fatal("delayed replay reverted state")
	}
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	w = f.request("GET", articlePath, other, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), `"postId"`) || !strings.Contains(w.Body.String(), `"revision":0`) {
		t.Fatal("private data leaked between accounts")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", articlePath, cookie, "", ""), 401)
}

func TestArticleReadingAccountWithoutGitHub(t *testing.T) {
	f := setup(t)
	w := f.request("POST", "/api/v1/auth/account/register", "", `{"username":"reading-user","password":"strong-password-123"}`, cfg.Origin)
	requireStatus(t, w, 200)
	var cookie string
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-dblog_session" {
			cookie = c.Name + "=" + c.Value
		}
	}
	requireStatus(t, f.request("GET", articlePath, cookie, "", ""), 200)
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", articleState), cfg.Origin), 200)
}

func TestArticleReadingConcurrentAndFailure(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, mutation := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			results <- f.request("PUT", articlePath, cookie, dailyBody(0, id, articleState), cfg.Origin)
		}(mutation)
	}
	wg.Wait()
	close(results)
	count := map[int]int{}
	for w := range results {
		count[w.Code]++
	}
	if count[200] != 1 || count[409] != 1 {
		t.Fatalf("concurrent update lost: %v", count)
	}
	// Keep sessions operational, fail the feature's SQL query itself.
	if _, err := f.db.Pool.Exec(ctx, "DROP TABLE article_reading"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("GET", articlePath, cookie, "", ""), 503)
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", articleState), cfg.Origin), 503)
}

func TestArticleReadingValidation(t *testing.T) {
	if !validArticleReading(json.RawMessage(articleState)) {
		t.Fatal("valid state rejected")
	}
	for _, state := range []string{
		`{"version":1,"preferences":null,"events":[]}`,
		strings.Replace(articleState, `"reviewInterval":0`, `"reviewInterval":null`, 1),
		strings.Replace(articleState, `"reviewInterval":0`, `"reviewInterval":3`, 1),
		strings.Replace(articleState, `"reviewFrom":null`, `"reviewFrom":"2026-11-07"`, 1),
		strings.Replace(articleState, `"day":"2026-11-07"`, `"day":"2026-02-30"`, 1),
		strings.Replace(articleState, `"interest":"want"`, `"interest":"seen"`, 1),
		strings.Replace(articleState, `"undone":false`, `"undone":null`, 1),
		strings.Replace(articleState, `"postId":"go"`, `"postId":"../go"`, 1),
		strings.Replace(articleState, `"events":[`, `"user_id":"other","events":[`, 1),
		strings.Replace(articleState, `"events":[`, `"events":[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","postId":"go","day":"2026-11-07","undone":false},`, 1),
	} {
		if validArticleReading(json.RawMessage(state)) {
			t.Fatal("invalid state accepted")
		}
	}
	f := setup(t)
	cookie := f.login(t, "")
	requireStatus(t, f.request("PUT", articlePath, cookie, strings.Replace(dailyBody(0, "11111111-1111-4111-8111-111111111111", articleState), `"baseRevision":0`, `"baseRevision":null`, 1), cfg.Origin), 400)
}

func TestArticleReadingThreeCategoriesAndLegacyUpgrade(t *testing.T) {
	for _, interest := range []string{"want", "seen", "skip"} {
		if !validArticleReading(json.RawMessage(strings.Replace(articleStateV2, `"interest":"seen"`, `"interest":"`+interest+`"`, 1))) {
			t.Fatalf("category %s rejected", interest)
		}
	}
	for _, state := range []string{
		strings.Replace(articleStateV2, `"interest":"seen"`, `"interest":"none"`, 1),
		strings.Replace(articleStateV2, `"previousInterest":"want"`, `"previousInterest":null`, 1),
		strings.Replace(articleStateV2, `"previousInterest":"want"`, `"previousInterest":"none"`, 1),
		strings.Replace(articleStateV2, `"interest":"seen"`, `"interest":"seen","reviewInterval":7`, 1),
		strings.Replace(articleStateV2, `"version":2`, `"version":3`, 1),
	} {
		if validArticleReading(json.RawMessage(state)) {
			t.Fatal("invalid v2 state accepted")
		}
	}
	// Upgrade the same private SQL record without resetting its revision or history.
	f := setup(t)
	cookie := f.login(t, "")
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", articleState), cfg.Origin), 200)
	requireStatus(t, f.request("PUT", articlePath, cookie, dailyBody(1, "22222222-2222-4222-8222-222222222222", articleStateV2), cfg.Origin), 200)
	w := f.request("GET", articlePath, cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":2`) || !strings.Contains(w.Body.String(), `"seen"`) || strings.Contains(w.Body.String(), `"reviewInterval"`) {
		t.Fatal("v2 upgrade failed to persist")
	}
}
