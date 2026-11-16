package httpapi

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const mindID = "10000000-0000-4000-8000-000000000001"
const mindPath = "/api/v1/mind/maps/" + mindID

func mindState(title string) string {
	return fmt.Sprintf(`{"version":1,"title":%q,"layout":"mind","viewport":{"x":123,"y":-42,"zoom":1.4},"nodes":[
 {"id":"20000000-0000-4000-8000-000000000001","parentId":null,"text":"中心主题","emoji":"","side":1},
 {"id":"20000000-0000-4000-8000-000000000002","parentId":"20000000-0000-4000-8000-000000000001","text":"子主题","emoji":"✅","side":1}]}`, title)
}

func TestMindPrivatePersistenceReplayAndViewport(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	state := mindState("我的导图")
	body := dailyBody(0, "30000000-0000-4000-8000-000000000001", state)
	for _, path := range []string{"/api/v1/mind/maps", mindPath} {
		requireStatus(t, f.request("GET", path, "", "", ""), 401)
	}
	requireStatus(t, f.request("PUT", mindPath, "", body, cfg.Origin), 401)
	requireStatus(t, f.request("PUT", mindPath, cookie, body, "https://evil.example"), 403)
	w := f.request("PUT", mindPath, cookie, body, cfg.Origin)
	requireStatus(t, w, 200)
	var response struct {
		User store.User    `json:"user"`
		Map  store.MindMap `json:"map"`
	}
	decode(t, w.Body.String(), &response)
	if response.Map.Revision != 1 || response.Map.UpdatedAt == nil || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing revision or private cache control")
	}
	stored, err := f.db.MindMap(ctx, response.User.ID, mindID)
	if err != nil || !strings.Contains(string(stored.State), `"zoom": 1.4`) || !strings.Contains(string(stored.State), "✅") {
		t.Fatal("viewport and markers did not persist in SQL")
	}
	requireStatus(t, f.request("PUT", mindPath, cookie, body, cfg.Origin), 200)
	if count(t, f.db, "mind_map_mutations") != 1 {
		t.Fatal("retry added a duplicate mutation")
	}
	requireStatus(t, f.request("PUT", mindPath, cookie, strings.Replace(body, "我的导图", "different", 1), cfg.Origin), 400)
	requireStatus(t, f.request("PUT", mindPath, cookie, dailyBody(0, "30000000-0000-4000-8000-000000000002", state), cfg.Origin), 409)
	w = f.request("GET", "/api/v1/mind/maps", cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"nodeCount":2`) || !strings.Contains(w.Body.String(), "我的导图") || strings.Contains(w.Body.String(), `"nodes"`) {
		t.Fatal("dashboard summaries are incomplete or include full documents")
	}
	f.identity.ID, f.identity.Login = "200", "bob"
	other := f.login(t, "")
	requireStatus(t, f.request("GET", mindPath, other, "", ""), 404)
	w = f.request("GET", "/api/v1/mind/maps", other, "", "")
	if strings.Contains(w.Body.String(), "我的导图") {
		t.Fatal("another account read the map")
	}
	// Even choosing the same UUID cannot overwrite another user's map.
	requireStatus(t, f.request("PUT", mindPath, other, dailyBody(0, "30000000-0000-4000-8000-000000000003", mindState("Bob")), cfg.Origin), 200)
	w = f.request("GET", mindPath, cookie, "", "")
	if !strings.Contains(w.Body.String(), "我的导图") {
		t.Fatal("owner map was overwritten")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", mindPath, cookie, "", ""), 401)
}

func TestMindConcurrentWritesAndRollback(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var wg sync.WaitGroup
	results := make(chan int, 2)
	for i := 1; i <= 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results <- f.request("PUT", mindPath, cookie, dailyBody(0, fmt.Sprintf("30000000-0000-4000-8000-%012d", i), mindState("原内容")), cfg.Origin).Code
		}(i)
	}
	wg.Wait()
	close(results)
	statuses := map[int]int{}
	for status := range results {
		statuses[status]++
	}
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("concurrent saves lost data: %v", statuses)
	}
	exec(t, f.db, `ALTER TABLE mind_map_mutations ADD CONSTRAINT reject_mind_receipt CHECK (base_revision < 1)`)
	requireStatus(t, f.request("PUT", mindPath, cookie, dailyBody(1, "30000000-0000-4000-8000-000000000003", mindState("不能提交")), cfg.Origin), 503)
	w := f.request("GET", mindPath, cookie, "", "")
	if strings.Contains(w.Body.String(), "不能提交") || !strings.Contains(w.Body.String(), "原内容") {
		t.Fatal("partial commit")
	}
	exec(t, f.db, "DROP TABLE mind_maps CASCADE")
	requireStatus(t, f.request("GET", "/api/v1/mind/maps", cookie, "", ""), 503)
}

func TestMindValidationAndOAuth(t *testing.T) {
	valid := mindState("结构")
	if !validMindState(json.RawMessage(valid)) {
		t.Fatal("valid state rejected")
	}
	for _, invalid := range []string{
		strings.Replace(valid, `"zoom":1.4`, `"zoom":0`, 1),
		strings.Replace(valid, `"zoom":1.4`, `"zoom":null`, 1),
		strings.Replace(valid, `"x":123`, `"x":1000001`, 1),
		strings.Replace(valid, `"layout":"mind"`, `"layout":"unknown"`, 1),
		strings.Replace(valid, `"emoji":"✅"`, `"emoji":"✅|❌"`, 1),
		strings.Replace(valid, `"parentId":null`, `"parentId":"20000000-0000-4000-8000-000000000002"`, 1),
		strings.Replace(valid, `"parentId":"20000000-0000-4000-8000-000000000001"`, `"parentId":"20000000-0000-4000-8000-000000000002"`, 1),
		strings.Replace(valid, `"parentId":"20000000-0000-4000-8000-000000000001"`, `"parentId":null`, 1),
		strings.Replace(valid, `"text":"子主题"`, fmt.Sprintf(`"text":%q`, strings.Repeat("文", 201)), 1),
		strings.Replace(valid, `"version":1`, `"version":1,"user_id":"bob"`, 1),
		strings.Replace(valid, `"side":1`, `"side":1,"color":"url(example)"`, 1),
		strings.Replace(valid, `"side":1`, `"side":1,"color":null`, 1),
		strings.Replace(valid, `"side":1`, `"side":1,"color":"#ffffff","extra":1`, 1),
	} {
		if validMindState(json.RawMessage(invalid)) {
			t.Fatalf("invalid state accepted: %s", invalid)
		}
	}
	f := setup(t)
	cookie := f.login(t, "")
	requireStatus(t, f.request("GET", "/api/v1/mind/maps?user_id=bob", cookie, "", ""), 400)
	requireStatus(t, f.request("GET", "/api/v1/mind/maps/not-an-id", cookie, "", ""), 400)
	requireStatus(t, f.request("PUT", mindPath, cookie, dailyBody(0, "30000000-0000-4000-8000-000000000001", strings.Replace(valid, `"zoom":1.4`, `"zoom":4`, 1)), cfg.Origin), 400)
	for _, path := range []string{"/Blog/mind", "/mind"} {
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?return_to="+path, "", "", ""), 302)
	}
}

func TestMindColorsAndMovedBranchPersistence(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	// Old documents without optional color remain readable and saveable.
	requireStatus(t, f.request("PUT", mindPath, cookie, dailyBody(0, "30000000-0000-4000-8000-000000000001", mindState("原导图")), cfg.Origin), 200)
	state := `{"version":1,"title":"拖动后","layout":"logic","viewport":{"x":0,"y":0,"zoom":1},"nodes":[
 {"id":"20000000-0000-4000-8000-000000000001","parentId":null,"text":"中心主题","emoji":"","side":1},
 {"id":"20000000-0000-4000-8000-000000000003","parentId":"20000000-0000-4000-8000-000000000001","text":"上方同级","emoji":"","side":1,"color":"#AbC123"},
 {"id":"20000000-0000-4000-8000-000000000002","parentId":"20000000-0000-4000-8000-000000000003","text":"✅前缀之外的原文\n仅手动换行","emoji":"✅","side":1,"color":"#edf5fb"}]}`
	requireStatus(t, f.request("PUT", mindPath, cookie, dailyBody(1, "30000000-0000-4000-8000-000000000002", state), cfg.Origin), 200)
	w := f.request("GET", mindPath, cookie, "", "")
	requireStatus(t, w, 200)
	var response struct {
		Map struct {
			Revision int64
			State    struct {
				Nodes []struct{ ID, ParentID, Text, Emoji, Color string }
			}
		}
	}
	decode(t, w.Body.String(), &response)
	nodes := response.Map.State.Nodes
	if response.Map.Revision != 2 || len(nodes) != 3 || nodes[1].ID != "20000000-0000-4000-8000-000000000003" ||
		nodes[1].Color != "#AbC123" || nodes[2].ParentID != nodes[1].ID || nodes[2].Color != "#edf5fb" ||
		nodes[2].Text != "✅前缀之外的原文\n仅手动换行" || nodes[2].Emoji != "✅" {
		t.Fatal("color, order, parent or manual line break did not persist")
	}
}
