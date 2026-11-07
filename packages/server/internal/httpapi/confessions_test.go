package httpapi

import (
	"encoding/json"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"strings"
	"sync"
	"testing"
)

const confessionPath = "/api/v1/confessions"
const confessionState = `{"version":1,"categories":[{"id":"10000000-0000-4000-8000-000000000001","name":"失败"}],"entries":[{"id":"20000000-0000-4000-8000-000000000001","categoryId":"10000000-0000-4000-8000-000000000001","content":"面试失败，继续练习","createdAt":"2026-11-08T12:00:00.000Z"}]}`

func TestConfessionPrivatePersistence(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", confessionState)
	requireStatus(t, f.request("GET", confessionPath, "", "", ""), 401)
	requireStatus(t, f.request("PUT", confessionPath, "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", confessionPath, cookie, body, "https://evil.example"), 403)
	w := f.request("PUT", confessionPath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User    store.User
		Archive store.ConfessionSnapshot
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Archive.Revision != 1 || response.Archive.UpdatedAt == nil || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing persistence confirmation or private cache headers")
	}
	got, err := f.db.Confessions(ctx, response.User.ID)
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), "面试失败") {
		t.Fatal("SQL did not persist private record")
	}
	requireStatus(t, f.request("PUT", confessionPath, cookie, body, cfg.Origin), 200)
	requireStatus(t, f.request("PUT", confessionPath, cookie, strings.Replace(body, "继续练习", "重新开始", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", confessionPath, cookie, dailyBody(0, "22222222-2222-4222-8222-222222222222", confessionState), cfg.Origin), 409)
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	w = f.request("GET", confessionPath, other, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "面试失败") || !strings.Contains(w.Body.String(), `"revision":0`) {
		t.Fatal("private record leaked to another account")
	}
	requireStatus(t, f.request("PUT", confessionPath, cookie, strings.Replace(body, `"state":`, `"user_id":"bob","state":`, 1), cfg.Origin), 400)
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", confessionPath, cookie, "", ""), 401)
}
func TestConfessionConcurrentAndRollback(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for _, id := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(mutation string) {
			defer wg.Done()
			results <- f.request("PUT", confessionPath, cookie, dailyBody(0, mutation, confessionState), cfg.Origin).Code
		}(id)
	}
	wg.Wait()
	close(results)
	count := map[int]int{}
	for code := range results {
		count[code]++
	}
	if count[200] != 1 || count[409] != 1 {
		t.Fatalf("concurrent updates lost: %v", count)
	}
	if _, err := f.db.Pool.Exec(ctx, `ALTER TABLE confession_mutations ADD CONSTRAINT reject_confession_receipt CHECK (base_revision < 1)`); err != nil {
		t.Fatal(err)
	}
	changed := strings.Replace(confessionState, "继续练习", "重新开始", 1)
	requireStatus(t, f.request("PUT", confessionPath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", changed), cfg.Origin), 503)
	w := f.request("GET", confessionPath, cookie, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "重新开始") || !strings.Contains(w.Body.String(), `"revision":1`) {
		t.Fatal("failed receipt partially committed record")
	}
	if _, err := f.db.Pool.Exec(ctx, "DROP TABLE confessions"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("GET", confessionPath, cookie, "", ""), 503)
}
func TestConfessionValidation(t *testing.T) {
	if !validConfessions(json.RawMessage(confessionState)) {
		t.Fatal("valid record rejected")
	}
	for _, raw := range []string{
		`{"version":1,"categories":null,"entries":[]}`,
		strings.Replace(confessionState, `"version":1`, `"version":2`, 1),
		strings.Replace(confessionState, `"name":"失败"`, `"name":"  "`, 1),
		strings.Replace(confessionState, `"content":"面试失败，继续练习"`, `"content":"\u0000"`, 1),
		strings.Replace(confessionState, `"content":"面试失败，继续练习"`, `"content":"`+strings.Repeat("海", 10001)+`"`, 1),
		strings.Replace(confessionState, `"createdAt":"2026-11-08T12:00:00.000Z"`, `"createdAt":"2026-02-30T12:00:00Z"`, 1),
		strings.Replace(confessionState, `"categoryId":"10000000-0000-4000-8000-000000000001"`, `"categoryId":"20000000-0000-4000-8000-000000000001"`, 1),
		strings.Replace(confessionState, `"entries":[`, `"user_id":"other","entries":[`, 1),
	} {
		if validConfessions(json.RawMessage(raw)) {
			t.Fatal("invalid confession accepted")
		}
	}
}
