package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const dailyState = `{"version":1,"tasks":[{"id":"follow-up","text":"跟进接口","date":"2026-11-06","note":"等待确认","priority":"high","scheduledFor":null,"completedOn":null}]}`

func dailyBody(base int, mutation, state string) string {
	return fmt.Sprintf(`{"baseRevision":%d,"mutationId":%q,"state":%s}`, base, mutation, state)
}
func TestDailyPlannerPersistenceAndIsolation(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	path := "/api/v1/planner/daily"
	requireStatus(t, f.request("GET", path, "", "", ""), 401)
	requireStatus(t, f.request("PUT", path, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", dailyState), "https://evil.example"), 403)
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", dailyState)
	w := f.request("PUT", path, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User    store.User
		Planner store.DailyPlannerSnapshot
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Planner.Revision != 1 || response.Planner.UpdatedAt == nil {
		t.Fatal("save was not confirmed")
	}
	requireStatus(t, f.request("PUT", path, cookie, body, cfg.Origin), 200)
	got, err := f.db.DailyPlanner(ctx, response.User.ID)
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), "跟进接口") {
		t.Fatal("idempotent SQL persistence failed")
	}
	requireStatus(t, f.request("PUT", path, cookie, strings.Replace(body, "跟进接口", "改写接口", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", path, cookie, dailyBody(0, "22222222-2222-4222-8222-222222222222", dailyState), cfg.Origin), 409)
	if v, err := f.db.Planner(ctx, response.User.ID); err != nil || v.Revision != 0 {
		t.Fatal("daily tasks entered monthly/GitHub data")
	}
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	w = f.request("GET", path, other, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "跟进接口") || !strings.Contains(w.Body.String(), `"revision":0`) {
		t.Fatal("another account saw private tasks")
	}
	requireStatus(t, f.request("GET", path, cookie, "", ""), 200)
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private response may be cached")
	}
}

func TestDailyPlannerConcurrentWritersAndFailure(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, mutation := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			results <- f.request("PUT", "/api/v1/planner/daily", cookie, dailyBody(0, id, dailyState), cfg.Origin)
		}(mutation)
	}
	wg.Wait()
	close(results)
	count := map[int]int{}
	for w := range results {
		count[w.Code]++
	}
	if count[200] != 1 || count[409] != 1 {
		t.Fatalf("lost-update protection failed: %v", count)
	}
	f.db.Pool.Close()
	requireStatus(t, f.request("GET", "/api/v1/planner/daily", cookie, "", ""), 503)
}

func TestDailyPlannerRequiresBoundAccount(t *testing.T) {
	f := setup(t)
	w := f.request("POST", "/api/v1/auth/account/register", "", `{"username":"planner-user","password":"strong-password-123"}`, cfg.Origin)
	requireStatus(t, w, 200)
	var cookie string
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-dblog_session" {
			cookie = c.Name + "=" + c.Value
		}
	}
	requireStatus(t, f.request("GET", "/api/v1/planner/daily", cookie, "", ""), 403)
	requireStatus(t, f.request("PUT", "/api/v1/planner/daily", cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", dailyState), cfg.Origin), 403)
}

func TestDailyPlannerValidation(t *testing.T) {
	if !validDailyPlanner(json.RawMessage(dailyState)) {
		t.Fatal("nullable scheduling must be accepted")
	}
	for _, raw := range []string{
		strings.Replace(dailyState, "2026-11-06", "2026-02-30", 1),
		strings.Replace(dailyState, `"scheduledFor":null`, `"scheduledFor":"2026-11-05"`, 1),
		strings.Replace(dailyState, `"completedOn":null`, `"completedOn":"2026-13-01"`, 1),
		strings.Replace(dailyState, `"priority":"high"`, `"priority":"urgent"`, 1),
		strings.Replace(dailyState, `"note":"等待确认"`, `"note":null`, 1),
		strings.Replace(dailyState, `"note":"等待确认"`, `"note":"`+strings.Repeat("😀", 501)+`"`, 1),
		`{"version":1,"tasks":null}`, `{"version":1,"tasks":[],"user_id":"other"}`,
	} {
		if validDailyPlanner(json.RawMessage(raw)) {
			t.Fatalf("invalid daily state accepted: %s", raw)
		}
	}
}

func TestMonthlyPlannerMetadataPersistence(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	state := `{"version":1,"months":{"2026-11":[{"id":"goal","text":"月度目标","completed":false,"category":"learning","priority":"high"}]}}`
	w := f.request("PUT", "/api/v1/planner/dashboard", cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", state), cfg.Origin)
	requireStatus(t, w, 200)
	var markdown string
	if err := f.db.Pool.QueryRow(ctx, "SELECT markdown FROM monthly_planners").Scan(&markdown); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(markdown, "category:learning priority:high") {
		t.Fatal("metadata lost in GitHub Markdown")
	}
}
