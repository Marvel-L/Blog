package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const loveLegacyState = `{"version":1,"tasks":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","text":"一起看海","note":"带上相机","createdOn":"2026-11-07","completedOn":null}]}`
const loveState = `{"version":2,"groups":[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","text":"一起在深圳生活","note":"","createdOn":"2026-11-07","tasks":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","text":"一起看海","note":"带上相机","createdOn":"2026-11-07","completedOn":null},{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","text":"做一顿饭","note":"","createdOn":"2026-11-07","completedOn":null}]}]}`
const lovePath = "/api/v1/love/tasks"

func TestLoveTaskPersistenceIsolationAndReplay(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", loveState)
	requireStatus(t, f.request("GET", lovePath, "", "", ""), 401)
	requireStatus(t, f.request("PUT", lovePath, "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", lovePath, cookie, body, ""), 403)
	requireStatus(t, f.request("PUT", lovePath, cookie, body, "https://evil.example"), 403)
	w := f.request("PUT", lovePath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User  store.User
		Tasks store.LoveTaskSnapshot
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Tasks.Revision != 1 || response.Tasks.UpdatedAt == nil || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("save not confirmed or cacheable")
	}
	got, err := f.db.LoveTasks(ctx, response.User.ID)
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), "一起看海") {
		t.Fatal("real SQL persistence failed")
	}
	requireStatus(t, f.request("PUT", lovePath, cookie, body, cfg.Origin), 200)
	requireStatus(t, f.request("PUT", lovePath, cookie, strings.Replace(body, "一起看海", "看日出", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(0, "22222222-2222-4222-8222-222222222222", loveState), cfg.Origin), 409)
	completed := strings.Replace(loveState, `"completedOn":null`, `"completedOn":"2026-11-08"`, 1)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", completed), cfg.Origin), 200)
	w = f.request("PUT", lovePath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":2`) || !strings.Contains(w.Body.String(), `"2026-11-08"`) {
		t.Fatal("delayed replay reverted completion")
	}
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(2, "44444444-4444-4444-8444-444444444444", loveState), cfg.Origin), 200)
	edited := strings.Replace(loveState, "一起看海", "一起看日出", 1)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(3, "55555555-5555-4555-8555-555555555555", edited), cfg.Origin), 200)
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	w = f.request("GET", lovePath, other, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "一起看") || !strings.Contains(w.Body.String(), `"revision":0`) {
		t.Fatal("private tasks leaked")
	}
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(4, "66666666-6666-4666-8666-666666666666", `{"version":2,"groups":[]}`), cfg.Origin), 200)
	got, err = f.db.LoveTasks(ctx, response.User.ID)
	if err != nil || got.Revision != 5 || strings.Contains(string(got.State), "一起看") {
		t.Fatal("deletion not persisted")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", lovePath, cookie, "", ""), 401)
}

func TestLoveTaskAccountWithoutGitHub(t *testing.T) {
	f := setup(t)
	w := f.request("POST", "/api/v1/auth/account/register", "", `{"username":"love-user","password":"strong-password-123"}`, cfg.Origin)
	requireStatus(t, w, 200)
	var cookie string
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-dblog_session" {
			cookie = c.Name + "=" + c.Value
		}
	}
	requireStatus(t, f.request("GET", lovePath, cookie, "", ""), 200)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", loveState), cfg.Origin), 200)
}

func TestLoveTaskConcurrentAndFailure(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var wg sync.WaitGroup
	results := make(chan *httptest.ResponseRecorder, 2)
	for _, mutation := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			results <- f.request("PUT", lovePath, cookie, dailyBody(0, id, loveState), cfg.Origin)
		}(mutation)
	}
	wg.Wait()
	close(results)
	count := map[int]int{}
	for w := range results {
		count[w.Code]++
	}
	if count[200] != 1 || count[409] != 1 {
		t.Fatalf("lost concurrent update: %v", count)
	}
	if _, err := f.db.Pool.Exec(ctx, "DROP TABLE love_tasks"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("GET", lovePath, cookie, "", ""), 503)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", loveState), cfg.Origin), 503)
}

func TestLoveTaskValidation(t *testing.T) {
	if !validLoveTasks(json.RawMessage(loveState)) || !validLoveTasks(json.RawMessage(loveLegacyState)) {
		t.Fatal("valid task rejected")
	}
	for _, raw := range []string{
		`{"version":1,"tasks":null}`, `{"version":2,"groups":null}`,
		`{"version":2,"groups":[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","text":"一起生活","note":"","createdOn":"2026-11-07","tasks":[]}]}`,
		strings.Replace(loveState, `"version":2`, `"version":3`, 1),
		strings.Replace(loveState, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", 1),
		strings.Replace(loveState, `"text":"一起看海"`, `"text":null`, 1),
		strings.Replace(loveState, `"text":"一起看海"`, `"text":"  "`, 1),
		strings.Replace(loveState, `"text":"一起看海"`, `"text":"一起\n看海"`, 1),
		strings.Replace(loveState, `"text":"一起看海"`, `"text":"`+strings.Repeat("海", 121)+`"`, 1),
		strings.Replace(loveState, `"note":"带上相机"`, `"note":null`, 1),
		strings.Replace(loveState, `"note":"带上相机"`, `"note":"\u0000"`, 1),
		strings.Replace(loveState, `"createdOn":"2026-11-07"`, `"createdOn":"2026-02-30"`, 1),
		strings.Replace(loveState, `"completedOn":null`, `"completedOn":"2026-11-06"`, 1),
		strings.Replace(loveState, `"completedOn":null`, `"completedOn":true`, 1),
		strings.Replace(loveState, `"tasks":[`, `"user_id":"other","tasks":[`, 1),
		strings.Replace(loveState, `"tasks":[`, `"tasks":[{"id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA","text":"duplicate","note":"","createdOn":"2026-11-07","completedOn":null},`, 1),
	} {
		if validLoveTasks(json.RawMessage(raw)) {
			t.Fatal("invalid tasks accepted")
		}
	}
	f := setup(t)
	cookie := f.login(t, "")
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", loveState)
	for _, raw := range []string{
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":null`, 1),
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":-1`, 1),
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":9007199254740991`, 1),
		strings.Replace(body, `"state":`, `"user_id":"other","state":`, 1),
		strings.Replace(body, "11111111-1111-4111-8111-111111111111", "invalid", 1),
	} {
		requireStatus(t, f.request("PUT", lovePath, cookie, raw, cfg.Origin), 400)
	}
}

func TestLoveTasksLegacyUpgrade(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	completed := strings.Replace(loveLegacyState, `"completedOn":null`, `"completedOn":"2026-11-08"`, 1)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", completed), cfg.Origin), 200)
	w := f.request("GET", lovePath, cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"version":1`) || !strings.Contains(w.Body.String(), `"2026-11-08"`) {
		t.Fatal("legacy saved content unavailable")
	}
	upgraded := strings.Replace(loveState, `"completedOn":null`, `"completedOn":"2026-11-08"`, 1)
	requireStatus(t, f.request("PUT", lovePath, cookie, dailyBody(1, "22222222-2222-4222-8222-222222222222", upgraded), cfg.Origin), 200)
	w = f.request("GET", lovePath, cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"version":2`) || !strings.Contains(w.Body.String(), `"2026-11-08"`) ||
		!strings.Contains(w.Body.String(), `"completedOn":null`) {
		t.Fatal("upgrade lost independent completion state")
	}
}

func TestLoveTaskRollbackOnReceiptFailure(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	if _, err := f.db.Pool.Exec(ctx, `ALTER TABLE love_task_mutations ADD CONSTRAINT reject_receipt CHECK (base_revision < 0)`); err != nil {
		t.Fatal(err)
	}
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", loveState)
	requireStatus(t, f.request("PUT", lovePath, cookie, body, cfg.Origin), 503)
	w := f.request("GET", lovePath, cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":0`) || strings.Contains(w.Body.String(), "一起看海") {
		t.Fatal("failed receipt partially committed a task")
	}
	if _, err := f.db.Pool.Exec(ctx, `ALTER TABLE love_task_mutations DROP CONSTRAINT reject_receipt`); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("PUT", lovePath, cookie, body, cfg.Origin), 200)
}
