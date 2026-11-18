package httpapi

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func resumeBody(user string, base int64, mutation, markdown string) string {
	raw, _ := json.Marshal(map[string]any{
		"expectedUserId": user, "baseRevision": base, "mutationId": mutation,
		"state": map[string]any{"version": 1, "markdown": markdown},
	})
	return string(raw)
}

func resumeOwner(t *testing.T, f *fixture, cookie string) string {
	t.Helper()
	var v struct{ User store.User }
	w := f.request("GET", "/api/v1/resume", cookie, "", "")
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &v)
	return v.User.ID
}

func TestResumePrivatePersistenceAndRetries(t *testing.T) {
	f := setup(t)
	alice := f.login(t, "")
	id := resumeOwner(t, f, alice)
	body := resumeBody(id, 0, "11111111-1111-4111-8111-111111111111", "# 姓名\n\n<mark>关键贡献</mark> <span style=\"color: red\">业绩</span>")
	requireStatus(t, f.request("GET", "/api/v1/resume", "", "", ""), 401)
	requireStatus(t, f.request("PUT", "/api/v1/resume", "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, "https://evil.example"), 403)
	w := f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin)
	requireStatus(t, w, 200)
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private resume is cacheable")
	}
	got, err := f.db.Resume(ctx, id)
	if err != nil || got.Revision != 1 || got.UpdatedAt == nil || !strings.Contains(string(got.State), "关键贡献") {
		t.Fatal("resume SQL persistence failed")
	}
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin), 200)
	if count(t, f.db, "resume_mutations") != 1 {
		t.Fatal("retry wrote another receipt")
	}
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, strings.Replace(body, "关键贡献", "篡改", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, resumeBody(id, 0, "22222222-2222-4222-8222-222222222222", "旧版本"), cfg.Origin), 409)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, resumeBody(id, 1, "33333333-3333-4333-8333-333333333333", "最新简历"), cfg.Origin), 200)
	// Replay after another update must return the newer document without overwriting it.
	w = f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), "最新简历") {
		t.Fatal("replayed receipt replaced newer content")
	}
	f.identity.ID, f.identity.Login = "200", "bob"
	bob := f.login(t, "")
	bobID := resumeOwner(t, f, bob)
	w = f.request("GET", "/api/v1/resume", bob, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"state":null`) || strings.Contains(w.Body.String(), "最新简历") {
		t.Fatal("private resume leaked across accounts")
	}
	requireStatus(t, f.request("PUT", "/api/v1/resume", bob, body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", "/api/v1/resume", bob, resumeBody(bobID, 0, "11111111-1111-4111-8111-111111111111", "Bob 简历"), cfg.Origin), 200)
	got, _ = f.db.Resume(ctx, id)
	if !strings.Contains(string(got.State), "最新简历") {
		t.Fatal("Bob changed Alice resume")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", alice, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", "/api/v1/resume", alice, "", ""), 401)
}

func TestResumeConcurrencyAndTransactionRollback(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	id := resumeOwner(t, f, cookie)
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for _, mutation := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(mutation string) {
			defer wg.Done()
			results <- f.request("PUT", "/api/v1/resume", cookie, resumeBody(id, 0, mutation, "第一版"), cfg.Origin).Code
		}(mutation)
	}
	wg.Wait()
	close(results)
	statuses := map[int]int{}
	for status := range results {
		statuses[status]++
	}
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("lost concurrent write: %v", statuses)
	}
	exec(t, f.db, "ALTER TABLE resume_mutations ADD CONSTRAINT reject_receipt CHECK (base_revision < 1)")
	requireStatus(t, f.request("PUT", "/api/v1/resume", cookie, resumeBody(id, 1, "33333333-3333-4333-8333-333333333333", "失败写入"), cfg.Origin), 503)
	got, _ := f.db.Resume(ctx, id)
	if got.Revision != 1 || strings.Contains(string(got.State), "失败写入") {
		t.Fatal("partial transaction committed")
	}
	exec(t, f.db, "DROP TABLE resumes")
	requireStatus(t, f.request("GET", "/api/v1/resume", cookie, "", ""), 503)
}

func TestResumeValidationAndLoginReturn(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	id := resumeOwner(t, f, cookie)
	body := resumeBody(id, 0, "11111111-1111-4111-8111-111111111111", "简历")
	for _, invalid := range []string{
		strings.Replace(body, `"version":1`, `"version":2`, 1),
		strings.Replace(body, `"markdown":"简历"`, `"markdown":null`, 1),
		strings.Replace(body, `"markdown":"简历"`, `"markdown":"\u0000"`, 1),
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":-1`, 1),
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":null`, 1),
		strings.Replace(body, `"baseRevision":0`, `"baseRevision":9007199254740991`, 1),
		strings.Replace(body, `"version":1`, `"version":1,"user_id":"bob"`, 1),
		strings.Replace(body, `"markdown":"简历"`, fmt.Sprintf(`"markdown":%q`, strings.Repeat("字", 100001)), 1),
	} {
		requireStatus(t, f.request("PUT", "/api/v1/resume", cookie, invalid, cfg.Origin), 400)
	}
	requireStatus(t, f.request("GET", "/api/v1/resume?user_id="+id, cookie, "", ""), 400)
	for _, path := range []string{"/resume", "/Blog/resume"} {
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(path), "", "", ""), 302)
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(path+"?user_id=bob"), "", "", ""), 400)
	}
}

func TestResumeCommentsValidationAndPersistence(t *testing.T) {
	f := setup(t)
	alice := f.login(t, "")
	id := resumeOwner(t, f, alice)
	comment := map[string]any{"id": "11111111-1111-4111-8111-111111111111", "quote": "系统", "body": "补充指标", "createdAt": "2026-11-16T10:00:00.000Z"}
	state := map[string]any{"version": 1, "markdown": `<span data-resume-comments="11111111-1111-4111-8111-111111111111">系统</span>`, "comments": []any{comment}}
	send := func(base int, mutation string) string {
		raw, _ := json.Marshal(map[string]any{"expectedUserId": id, "baseRevision": base, "mutationId": mutation, "state": state})
		return string(raw)
	}
	body := send(0, "11111111-1111-4111-8111-111111111111")
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin), 200)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin), 200)
	got, err := f.db.Resume(ctx, id)
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), "补充指标") {
		t.Fatal("comments did not persist atomically")
	}
	comment["body"] = "补充并发指标"
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(1, "22222222-2222-4222-8222-222222222222"), cfg.Origin), 200)
	w := f.request("GET", "/api/v1/resume", alice, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), "补充并发指标") {
		t.Fatal("comments-only edit was lost")
	}
	for _, invalid := range []any{nil, []any{comment, comment}, "wrong"} {
		state["comments"] = invalid
		requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(2, "33333333-3333-4333-8333-333333333333"), cfg.Origin), 400)
	}
	for key, invalid := range map[string]any{"id": "bad", "quote": strings.Repeat("字", 1001), "body": "\x00", "createdAt": "2026-02-30T10:00:00.000Z"} {
		previous := comment[key]
		comment[key] = invalid
		state["comments"] = []any{comment}
		requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(2, "33333333-3333-4333-8333-333333333333"), cfg.Origin), 400)
		comment[key] = previous
	}
	f.identity.ID, f.identity.Login = "201", "comment-bob"
	bob := f.login(t, "")
	w = f.request("GET", "/api/v1/resume", bob, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "补充并发指标") || !strings.Contains(w.Body.String(), `"state":null`) {
		t.Fatal("comments leaked across accounts")
	}
	requireStatus(t, f.request("PUT", "/api/v1/resume", bob, body, cfg.Origin), 401)
	state["comments"] = []any{}
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(2, "33333333-3333-4333-8333-333333333333"), cfg.Origin), 200)
}

func TestDraftLibraryUpgradeIsolationAndLegacyGuard(t *testing.T) {
	f := setup(t)
	alice := f.login(t, "")
	id := resumeOwner(t, f, alice)
	old := resumeBody(id, 0, "11111111-1111-4111-8111-111111111111", "# 原有简历")
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, old, cfg.Origin), 200)
	first := map[string]any{"id": "00000000-0000-4000-8000-000000000019", "title": "我的简历",
		"content": map[string]any{"version": 1, "markdown": "# 原有简历"}}
	second := map[string]any{"id": "22222222-2222-4222-8222-222222222222", "title": "项目主稿", "kind": "interview",
		"content": map[string]any{"version": 1, "markdown": "# 异常恢复\n\n![方案图](https://example.com/flow.png)"}}
	state := map[string]any{"version": 2, "documents": []any{first, second}}
	send := func(base int, mutation string) string {
		raw, _ := json.Marshal(map[string]any{"expectedUserId": id, "baseRevision": base, "mutationId": mutation, "state": state})
		return string(raw)
	}
	body := send(1, "33333333-3333-4333-8333-333333333333")
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, "https://evil.example"), 403)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin), 200)
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, body, cfg.Origin), 200)
	got, err := f.db.Resume(ctx, id)
	if err != nil || got.Revision != 2 || !strings.Contains(string(got.State), "原有简历") || !strings.Contains(string(got.State), "异常恢复") {
		t.Fatal("library upgrade lost a document")
	}
	var persisted struct {
		Documents []struct{ Kind string }
	}
	if json.Unmarshal(got.State, &persisted) != nil || len(persisted.Documents) != 2 || persisted.Documents[1].Kind != "interview" {
		t.Fatal("historical library metadata was rejected or rewritten")
	}
	// Old clients, even with the latest revision, cannot wipe the library.
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice,
		resumeBody(id, 2, "44444444-4444-4444-8444-444444444444", "旧客户端覆盖"), cfg.Origin), 409)
	// Replaying a pre-upgrade receipt remains safe and returns the current library.
	w := f.request("PUT", "/api/v1/resume", alice, old, cfg.Origin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), "项目主稿") {
		t.Fatal("legacy receipt replaced upgraded library")
	}
	for _, invalid := range []any{
		nil, []any{first, first},
		[]any{map[string]any{"id": first["id"], "title": "嵌套", "kind": "resume", "content": map[string]any{"version": 2, "documents": []any{}}}},
		[]any{map[string]any{"id": first["id"], "title": "错误字段", "kind": "invalid", "content": first["content"]}},
	} {
		state["documents"] = invalid
		requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(2, "55555555-5555-4555-8555-555555555555"), cfg.Origin), 400)
	}
	state["documents"] = []any{first, second}
	second["title"] = "主稿定稿"
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(2, "55555555-5555-4555-8555-555555555555"), cfg.Origin), 200)
	f.identity.ID, f.identity.Login = "203", "library-bob"
	bob := f.login(t, "")
	requireStatus(t, f.request("PUT", "/api/v1/resume", bob, body, cfg.Origin), 401)
	w = f.request("GET", "/api/v1/resume", bob, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "原有简历") || strings.Contains(w.Body.String(), "定稿") {
		t.Fatal("library leaked across accounts")
	}
	state["documents"] = []any{first}
	requireStatus(t, f.request("PUT", "/api/v1/resume", alice, send(3, "66666666-6666-4666-8666-666666666666"), cfg.Origin), 200)
	got, _ = f.db.Resume(ctx, id)
	if got.Revision != 4 || strings.Contains(string(got.State), "异常恢复") || !strings.Contains(string(got.State), "原有简历") {
		t.Fatal("deleting one document changed another")
	}
}
