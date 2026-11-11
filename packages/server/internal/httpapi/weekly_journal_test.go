package httpapi

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const weeklyPath = "/api/v1/weekly-journal?week=2026-11-09"

func weeklyState(week, content string) string {
	monday, _ := time.Parse("2006-01-02", week)
	days := make([]map[string]any, 7)
	for i := range days {
		days[i] = map[string]any{"date": monday.AddDate(0, 0, i).Format("2006-01-02"), "content": "", "thoughts": []any{}}
	}
	days[0]["content"] = content
	days[3]["thoughts"] = []any{map[string]string{"id": "20000000-0000-4000-8000-000000000001", "content": "今天的感想", "createdAt": "2026-11-12T01:30:00Z"}}
	raw, _ := json.Marshal(map[string]any{"version": 1, "days": days})
	return string(raw)
}

func TestWeeklyJournalPrivatePersistenceAndWeeks(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	state := weeklyState("2026-11-09", "### LeetCode\n\n[跳跃游戏](https://leetcode.cn/problems/jump-game/)")
	body := dailyBody(0, "11111111-1111-4111-8111-111111111111", state)
	requireStatus(t, f.request("GET", weeklyPath, "", "", ""), 401)
	requireStatus(t, f.request("PUT", weeklyPath, "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", weeklyPath, cookie, body, "https://evil.example"), 403)
	w := f.request("PUT", weeklyPath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User      store.User
		WeekStart string
		Archive   store.WeeklyJournalSnapshot
	}
	decode(t, w.Body.String(), &response)
	if response.WeekStart != "2026-11-09" || response.Archive.Revision != 1 || response.Archive.UpdatedAt == nil || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing persistence or private cache headers")
	}
	got, err := f.db.WeeklyJournal(ctx, response.User.ID, "2026-11-09")
	if err != nil || got.Revision != 1 || !strings.Contains(string(got.State), "跳跃游戏") {
		t.Fatal("SQL did not persist day content")
	}
	w = f.request("GET", "/api/v1/weekly-journal?week=2026-11-15", cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"weekStart":"2026-11-09"`) || !strings.Contains(w.Body.String(), "今天的感想") {
		t.Fatal("Sunday did not resolve to the preceding Monday")
	}
	requireStatus(t, f.request("PUT", weeklyPath, cookie, body, cfg.Origin), 200)
	if count(t, f.db, "weekly_journal_mutations") != 1 {
		t.Fatal("retry created duplicate receipts")
	}
	requireStatus(t, f.request("PUT", weeklyPath, cookie, strings.Replace(body, "跳跃游戏", "修改内容", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", weeklyPath, cookie, dailyBody(0, "22222222-2222-4222-8222-222222222222", state), cfg.Origin), 409)

	otherWeek := "/api/v1/weekly-journal?week=2025-12-29"
	w = f.request("GET", otherWeek, cookie, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "跳跃游戏") || !strings.Contains(w.Body.String(), `"state":null`) {
		t.Fatal("week content leaked into another week")
	}
	requireStatus(t, f.request("PUT", otherWeek, cookie, dailyBody(0, "11111111-1111-4111-8111-111111111111", weeklyState("2025-12-29", "跨年周")), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", otherWeek, cookie, dailyBody(0, "33333333-3333-4333-8333-333333333333", weeklyState("2025-12-29", "跨年周")), cfg.Origin), 200)
	w = f.request("GET", "/api/v1/weekly-journal?week=2026-01-04", cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"weekStart":"2025-12-29"`) || !strings.Contains(w.Body.String(), "跨年周") {
		t.Fatal("cross-year Sunday grouping failed")
	}
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	w = f.request("GET", weeklyPath, other, "", "")
	requireStatus(t, w, 200)
	if strings.Contains(w.Body.String(), "跳跃游戏") || !strings.Contains(w.Body.String(), `"revision":0`) {
		t.Fatal("another account saw private journal")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", weeklyPath, cookie, "", ""), 401)
}

func TestWeeklyJournalConcurrentAndRollback(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	state := weeklyState("2026-11-09", "旧记录")
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for _, mutation := range []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			results <- f.request("PUT", weeklyPath, cookie, dailyBody(0, id, state), cfg.Origin).Code
		}(mutation)
	}
	wg.Wait()
	close(results)
	statuses := map[int]int{}
	for status := range results {
		statuses[status]++
	}
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("concurrent writes lost: %v", statuses)
	}
	exec(t, f.db, `ALTER TABLE weekly_journal_mutations ADD CONSTRAINT reject_weekly_receipt CHECK (base_revision < 1)`)
	requireStatus(t, f.request("PUT", weeklyPath, cookie, dailyBody(1, "33333333-3333-4333-8333-333333333333", weeklyState("2026-11-09", "失败写入")), cfg.Origin), 503)
	w := f.request("GET", weeklyPath, cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), "旧记录") || strings.Contains(w.Body.String(), "失败写入") {
		t.Fatal("failed receipt partially committed journal")
	}
	exec(t, f.db, "DROP TABLE weekly_journals")
	requireStatus(t, f.request("GET", weeklyPath, cookie, "", ""), 503)
}

func TestWeeklyJournalValidation(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	for _, query := range []string{"week=", "week=2026-02-30", "week=2026-1-2", "week=1899-12-31", "week=2101-01-01", "week=2026-11-09&week=2026-11-16", "week=2026-11-09&user_id=bob", "user_id=bob"} {
		requireStatus(t, f.request("GET", "/api/v1/weekly-journal?"+query, cookie, "", ""), 400)
	}
	valid := weeklyState("2026-11-09", "合法内容")
	monday, _ := time.Parse("2006-01-02", "2026-11-09")
	if !validWeeklyJournal(json.RawMessage(valid), monday) {
		t.Fatal("valid journal rejected")
	}
	for index, invalid := range []string{
		strings.Replace(valid, `"version":1`, `"version":2`, 1),
		strings.Replace(valid, `"date":"2026-11-09"`, `"date":"2026-11-16"`, 1),
		strings.Replace(valid, `"content":"合法内容"`, `"content":null`, 1),
		strings.Replace(valid, `"content":"合法内容"`, `"content":"\u0000"`, 1),
		strings.Replace(valid, `"content":"合法内容"`, fmt.Sprintf(`"content":%q`, strings.Repeat("字", 20001)), 1),
		strings.Replace(valid, `"content":"今天的感想"`, `"content":"  "`, 1),
		strings.Replace(valid, `"createdAt":"2026-11-12T01:30:00Z"`, `"createdAt":"2026-02-30T00:00:00Z"`, 1),
		strings.Replace(valid, `"thoughts":[]`, `"thoughts":null`, 1),
		strings.Replace(valid, `"version":1`, `"version":1,"user_id":"bob"`, 1),
	} {
		body := dailyBody(0, fmt.Sprintf("00000000-0000-4000-8000-%012d", index+1), invalid)
		requireStatus(t, f.request("PUT", weeklyPath, cookie, body, cfg.Origin), 400)
	}
	requireStatus(t, f.request("PUT", weeklyPath, cookie, strings.Replace(dailyBody(0, "11111111-1111-4111-8111-111111111111", valid), `"state":`, `"user_id":"bob","state":`, 1), cfg.Origin), 400)
	w := f.request("GET", "/api/v1/weekly-journal", cookie, "", "")
	requireStatus(t, w, 200)
	var today struct{ Today, WeekStart string }
	decode(t, w.Body.String(), &today)
	day, ok := journalDate(today.Today)
	if !ok || journalMonday(day).Format("2006-01-02") != today.WeekStart {
		t.Fatal("default week did not use server's natural day")
	}
}

func TestWeeklyJournalOAuthReturn(t *testing.T) {
	f := setup(t)
	for _, path := range []string{"/Blog/weekly-journal", "/weekly-journal"} {
		w := f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(path), "", "", "")
		requireStatus(t, w, 302)
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(path+"?user_id=bob"), "", "", ""), 400)
	}
}
