package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/github"
)

func mustUUID() string { return "315fc762-613d-4b27-bef1-900686b00001" }

func (f *fixture) anki(t *testing.T, method, path, cookie, body string) *httptest.ResponseRecorder {
	t.Helper()
	return f.request(method, path, cookie, body, cfg.Origin)
}

func TestAnkiRequiresSession(t *testing.T) {
	f := setup(t)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/dashboard", "", ""), 401)
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/categories", "", `{"name":"x"}`), 401)
}

func TestAnkiLifecycleAndIdempotency(t *testing.T) {
	f := setup(t)
	f.identity = github.Identity{ID: "100", Login: "alice", Name: "Alice"}
	cookie := f.login(t, "")

	// 分类与重复名
	cat := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"语言"}`)
	requireStatus(t, cat, 200)
	var category struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	decode(t, cat.Body.String(), &category)
	if category.Name != "语言" {
		t.Fatal("category name not echoed")
	}
	dup := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"语言"}`)
	requireStatus(t, dup, 409)

	// 库
	deck := f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category.ID+`","name":"西语"}`)
	requireStatus(t, deck, 200)
	var deckObj struct {
		ID         string `json:"id"`
		CategoryID string `json:"categoryId"`
	}
	decode(t, deck.Body.String(), &deckObj)
	if deckObj.CategoryID != category.ID {
		t.Fatal("deck not linked to category")
	}
	badDeck := f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+mustUUID()+`","name":"x"}`)
	requireStatus(t, badDeck, 404)

	// 卡片
	card := f.anki(t, "POST", "/api/v1/anki/decks/"+deckObj.ID+"/cards", cookie, `{"question":"hola","answer":"你好"}`)
	requireStatus(t, card, 200)
	var c map[string]any
	decode(t, card.Body.String(), &c)
	if c["version"].(float64) != 1 || c["intervalDays"].(float64) != 0 || c["reviewCount"].(float64) != 0 {
		t.Fatalf("fresh card state wrong: %v", c)
	}
	cardID := c["id"].(string)

	// 列表
	list := f.anki(t, "GET", "/api/v1/anki/decks/"+deckObj.ID+"/cards", cookie, "")
	requireStatus(t, list, 200)

	// 队列含新卡 + previews
	q := f.anki(t, "GET", "/api/v1/anki/decks/"+deckObj.ID+"/queue", cookie, "")
	requireStatus(t, q, 200)
	var queue struct {
		Cards     []map[string]any `json:"cards"`
		ServerNow string           `json:"serverNow"`
		Previews  map[string]any   `json:"previews"`
	}
	decode(t, q.Body.String(), &queue)
	if len(queue.Cards) != 1 || queue.ServerNow == "" {
		t.Fatalf("queue wrong: %v", queue.Cards)
	}
	if _, ok := queue.Previews[cardID]; !ok {
		t.Fatal("queue should include per-card interval previews")
	}

	// 正确评价 -> version 2, interval 3, reps 1
	mutation := `{"cardId":"` + cardID + `","version":1,"mutationId":"` + mustUUID() + `","rating":"correct"}`
	rev := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, mutation)
	requireStatus(t, rev, 200)
	var revBody struct {
		Card map[string]any `json:"card"`
	}
	decode(t, rev.Body.String(), &revBody)
	if revBody.Card["version"].(float64) != 2 || revBody.Card["intervalDays"].(float64) != 1 || revBody.Card["repetitions"].(float64) != 1 {
		t.Fatalf("after correct: %v", revBody.Card)
	}

	// 同 mutationId 同 payload 重放 -> 幂等，不推进、不重复计数
	replay := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, mutation)
	requireStatus(t, replay, 200)
	var replayBody struct {
		Card map[string]any `json:"card"`
	}
	decode(t, replay.Body.String(), &replayBody)
	if replayBody.Card["version"].(float64) != 2 {
		t.Fatalf("idempotent replay advanced version: %v", replayBody.Card)
	}

	// 跨卡复用同一 mutationId -> 异 payload（card_id 不同），必须 400 而不是吞评价
	card2 := f.anki(t, "POST", "/api/v1/anki/decks/"+deckObj.ID+"/cards", cookie, `{"question":"dos","answer":"二"}`)
	requireStatus(t, card2, 200)
	var c2 map[string]any
	decode(t, card2.Body.String(), &c2)
	crossCard := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+c2["id"].(string)+`","version":1,"mutationId":"`+mustUUID()+`","rating":"correct"}`)
	requireStatus(t, crossCard, 400)

	// 同卡同评级但异提交 version 重放同一 mutationId -> 异 payload，必须 400
	versionMismatch := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":2,"mutationId":"`+mustUUID()+`","rating":"correct"}`)
	requireStatus(t, versionMismatch, 400)

	// 同 mutationId 异 payload -> 报错
	mismatch := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":2,"mutationId":"`+mustUUID()+`","rating":"wrong"}`)
	requireStatus(t, mismatch, 400)

	// 把到期拨回过去（correct 后 due=+1 天），才能真正触发版本冲突而非被未到期守卫拦下。
	f.duePast(t, cardID)
	// 版本冲突 -> 409
	conflict := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":1,"mutationId":"9f1c0000-0000-4000-8000-000000000001","rating":"correct"}`)
	requireStatus(t, conflict, 409)

	// PATCH 旧版本 -> 409；正确版本更新文本并保留进度
	stalePatch := f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, `{"question":"hola!","answer":"你好","resetProgress":false,"version":1}`)
	requireStatus(t, stalePatch, 409)
	patch := f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, `{"question":"hola!","answer":"你好呀","resetProgress":false,"version":2}`)
	requireStatus(t, patch, 200)
	var patched map[string]any
	decode(t, patch.Body.String(), &patched)
	if patched["question"].(string) != "hola!" || patched["intervalDays"].(float64) != 1 || patched["reviewCount"].(float64) != 1 {
		t.Fatalf("patch should preserve progress: %v", patched)
	}

	// 自定义天数独立分支：不改变 EF/reps，仅设定间隔
	efBefore := patched["easeFactor"].(float64)
	repsBefore := patched["repetitions"].(float64)
	custom := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":3,"mutationId":"9f1c0000-0000-4000-8000-000000000002","customDays":15}`)
	requireStatus(t, custom, 200)
	var customBody struct {
		Card map[string]any `json:"card"`
	}
	decode(t, custom.Body.String(), &customBody)
	if customBody.Card["intervalDays"].(float64) != 15 {
		t.Fatalf("custom interval: %v", customBody.Card)
	}
	if customBody.Card["easeFactor"].(float64) != efBefore || customBody.Card["repetitions"].(float64) != repsBefore {
		t.Fatalf("custom must not change EF/reps: %v ef %v", customBody.Card, efBefore)
	}
	// rating 与 customDays 同时提交 -> 400
	both := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":4,"mutationId":"9f1c0000-0000-4000-8000-000000000003","rating":"correct","customDays":5}`)
	requireStatus(t, both, 400)

	// 目标
	goal := f.anki(t, "PUT", "/api/v1/anki/goal", cookie, `{"goal":20}`)
	requireStatus(t, goal, 200)

	// 仪表盘：分类/库统计/今日/时区/历史
	dash := f.anki(t, "GET", "/api/v1/anki/dashboard", cookie, "")
	requireStatus(t, dash, 200)
	var d struct {
		Categories []map[string]any `json:"categories"`
		Decks      []map[string]any `json:"decks"`
		Goal       float64          `json:"goal"`
		Today      string           `json:"today"`
		TimeZone   string           `json:"timeZone"`
		History    []map[string]any `json:"history"`
	}
	decode(t, dash.Body.String(), &d)
	if d.TimeZone != "Asia/Shanghai" || d.Today == "" || d.Goal != 20 {
		t.Fatalf("dashboard meta wrong: %+v", d)
	}
	if len(d.Decks) != 1 || d.Decks[0]["total"].(float64) != 2 || d.Decks[0]["learned"].(float64) != 1 {
		t.Fatalf("deck stats wrong: %+v", d.Decks)
	}
	// reviews 只计有效提交：correct(1) + custom(1) = 2；同卡当日 uniqueCards=1
	var todayRow map[string]any
	for _, h := range d.History {
		if h["date"] == d.Today {
			todayRow = h
		}
	}
	if todayRow == nil {
		t.Fatalf("today missing in history: %v", d.History)
	}
	if todayRow["reviews"].(float64) != 2 || todayRow["uniqueCards"].(float64) != 1 {
		t.Fatalf("daily stats wrong: %+v", todayRow)
	}
}

func TestAnkiAccountIsolation(t *testing.T) {
	f := setup(t)
	f.identity = github.Identity{ID: "100", Login: "alice", Name: "Alice"}
	alice := f.login(t, "")
	cat := f.anki(t, "POST", "/api/v1/anki/categories", alice, `{"name":"私有"}`)
	requireStatus(t, cat, 200)
	var category struct{ ID string }
	decode(t, cat.Body.String(), &category)
	deck := f.anki(t, "POST", "/api/v1/anki/decks", alice, `{"categoryId":"`+category.ID+`","name":"d"}`)
	requireStatus(t, deck, 200)
	var deckObj struct{ ID string }
	decode(t, deck.Body.String(), &deckObj)
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	// bob 不能读 alice 的库/卡片/队列
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/decks/"+deckObj.ID+"/cards", bob, ""), 404)
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/decks/"+deckObj.ID+"/queue", bob, ""), 404)
	// bob 的仪表盘为空
	dash := f.anki(t, "GET", "/api/v1/anki/dashboard", bob, "")
	requireStatus(t, dash, 200)
	var d struct {
		Categories []map[string]any `json:"categories"`
		Decks      []map[string]any `json:"decks"`
	}
	decode(t, dash.Body.String(), &d)
	if len(d.Categories) != 0 || len(d.Decks) != 0 {
		t.Fatalf("bob should see nothing: %+v", d)
	}
}

func TestAnkiConcurrentReviews(t *testing.T) {
	f := setup(t)
	f.identity = github.Identity{ID: "100", Login: "alice", Name: "Alice"}
	cookie := f.login(t, "")

	cat := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"并发"}`)
	requireStatus(t, cat, 200)
	var category struct{ ID string }
	decode(t, cat.Body.String(), &category)
	deck := f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category.ID+`","name":"d"}`)
	requireStatus(t, deck, 200)
	var deckObj struct{ ID string }
	decode(t, deck.Body.String(), &deckObj)

	newCard := func() string {
		c := f.anki(t, "POST", "/api/v1/anki/decks/"+deckObj.ID+"/cards", cookie, `{"question":"q","answer":"a"}`)
		requireStatus(t, c, 200)
		var m map[string]any
		decode(t, c.Body.String(), &m)
		return m["id"].(string)
	}

	// 场景 A：N 个 goroutine 同 mutationId 同 payload 并发评价同一新卡。
	// 仅一个真正落库，其余经幂等重放返回当前卡；最终 reviews=1、unique=1、version=2。
	card1 := newCard()
	const mA = "9f1c0000-0000-4000-8000-00000000a0a1"
	bodyA := `{"cardId":"` + card1 + `","version":1,"mutationId":"` + mA + `","rating":"correct"}`
	const N = 8
	var wg sync.WaitGroup
	codes := make(chan int, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- f.request("POST", "/api/v1/anki/reviews", cookie, bodyA, cfg.Origin).Code
		}()
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 {
			t.Fatalf("同 mutationId 同 payload 重放必须 200，got %d", code)
		}
	}

	// 场景 B：2 个 goroutine 不同 mutationId、同提交 version=1 并发评价另一新卡。
	// 一个真正提交 200，另一个撞上已推进的版本得 409，仅产生一次评价。
	card2 := newCard()
	bodyB1 := `{"cardId":"` + card2 + `","version":1,"mutationId":"9f1c0000-0000-4000-8000-00000000a0b1","rating":"correct"}`
	bodyB2 := `{"cardId":"` + card2 + `","version":1,"mutationId":"9f1c0000-0000-4000-8000-00000000a0b2","rating":"correct"}`
	two := make(chan int, 2)
	var wg2 sync.WaitGroup
	for _, b := range [2]string{bodyB1, bodyB2} {
		wg2.Add(1)
		go func(body string) {
			defer wg2.Done()
			two <- f.request("POST", "/api/v1/anki/reviews", cookie, body, cfg.Origin).Code
		}(b)
	}
	wg2.Wait()
	close(two)
	var ok200, conflict409 int
	for code := range two {
		switch code {
		case 200:
			ok200++
		case 409:
			conflict409++
		default:
			t.Fatalf("并发不同 mutationId 应恰一个 200 一个 409，got %d", code)
		}
	}
	if ok200 != 1 || conflict409 != 1 {
		t.Fatalf("期望 1×200 + 1×409，got %d/%d", ok200, conflict409)
	}

	// 汇总断言：card1 版本恰 2；今日 reviews=2（card1 一次 + card2 一次），uniqueCards=2。
	dash := f.anki(t, "GET", "/api/v1/anki/dashboard", cookie, "")
	requireStatus(t, dash, 200)
	var d struct {
		Today   string           `json:"today"`
		History []map[string]any `json:"history"`
	}
	decode(t, dash.Body.String(), &d)
	var todayRow map[string]any
	for _, h := range d.History {
		if h["date"] == d.Today {
			todayRow = h
		}
	}
	if todayRow == nil {
		t.Fatalf("today missing: %v", d.History)
	}
	if todayRow["reviews"].(float64) != 2 || todayRow["uniqueCards"].(float64) != 2 {
		t.Fatalf("并发后当日聚合错误: %+v", todayRow)
	}
}

func TestAnkiNotDueGuard(t *testing.T) {
	f := setup(t)
	f.identity = github.Identity{ID: "100", Login: "alice", Name: "Alice"}
	cookie := f.login(t, "")

	cat := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"到期"}`)
	requireStatus(t, cat, 200)
	var category struct{ ID string }
	decode(t, cat.Body.String(), &category)
	deck := f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category.ID+`","name":"d"}`)
	requireStatus(t, deck, 200)
	var deckObj struct{ ID string }
	decode(t, deck.Body.String(), &deckObj)
	card := f.anki(t, "POST", "/api/v1/anki/decks/"+deckObj.ID+"/cards", cookie, `{"question":"q","answer":"a"}`)
	requireStatus(t, card, 200)
	var cm map[string]any
	decode(t, card.Body.String(), &cm)
	cardID := cm["id"].(string)

	const m = "9f1c0000-0000-4000-8000-00000000c001"
	// 首次合法评价（新卡到期）-> version 2，due 变未来（+1 天）。
	first := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":1,"mutationId":"`+m+`","rating":"correct"}`)
	requireStatus(t, first, 200)

	// 伪造直接请求提前自评：新 mutationId、当前 version，但卡未到期 -> 409，不推进不计日志。
	early := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":2,"mutationId":"9f1c0000-0000-4000-8000-00000000c002","rating":"correct"}`)
	requireStatus(t, early, 409)

	// 合法原 mutation 重放即便卡处于未来仍应 200 幂等，不被 due 守卫误拒。
	replay := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":1,"mutationId":"`+m+`","rating":"correct"}`)
	requireStatus(t, replay, 200)
	var rb struct {
		Card map[string]any `json:"card"`
	}
	decode(t, replay.Body.String(), &rb)
	if rb.Card["version"].(float64) != 2 {
		t.Fatalf("replay must not advance version: %v", rb.Card)
	}

	// 拨回过去后再评 -> 200，version 推进到 3。
	f.duePast(t, cardID)
	again := f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":2,"mutationId":"9f1c0000-0000-4000-8000-00000000c003","rating":"correct"}`)
	requireStatus(t, again, 200)
	decode(t, again.Body.String(), &rb)
	if rb.Card["version"].(float64) != 3 {
		t.Fatalf("after duePast review should advance to version 3: %v", rb.Card)
	}

	// 统计：仅两次有效评价（首评 + duePast 后），提前自评被拒不计入。
	dash := f.anki(t, "GET", "/api/v1/anki/dashboard", cookie, "")
	requireStatus(t, dash, 200)
	var d struct {
		Today   string           `json:"today"`
		History []map[string]any `json:"history"`
	}
	decode(t, dash.Body.String(), &d)
	var todayRow map[string]any
	for _, h := range d.History {
		if h["date"] == d.Today {
			todayRow = h
		}
	}
	if todayRow == nil || todayRow["reviews"].(float64) != 2 || todayRow["uniqueCards"].(float64) != 1 {
		t.Fatalf("early review must not count: %+v", todayRow)
	}
}

func TestAnkiMovePreservesProgressAndHistory(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var category, firstDeck, secondDeck map[string]any
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"迁库"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &category)
	newDeck := func(name string) map[string]any {
		w := f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category["id"].(string)+`","name":"`+name+`"}`)
		requireStatus(t, w, 200)
		var d map[string]any
		decode(t, w.Body.String(), &d)
		return d
	}
	firstDeck, secondDeck = newDeck("原库"), newDeck("目标库")
	w = f.anki(t, "POST", "/api/v1/anki/decks/"+firstDeck["id"].(string)+"/cards", cookie, `{"question":"q","answer":"a"}`)
	requireStatus(t, w, 200)
	var c map[string]any
	decode(t, w.Body.String(), &c)
	cardID := c["id"].(string)
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+cardID+`","version":1,"mutationId":"`+mustUUID()+`","rating":"correct"}`)
	requireStatus(t, w, 200)
	var review struct {
		Card map[string]any `json:"card"`
	}
	decode(t, w.Body.String(), &review)
	patch := `{"deckId":"` + secondDeck["id"].(string) + `","question":"new q","answer":"new a","resetProgress":false,"version":2}`
	w = f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, patch)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if c["deckId"] != secondDeck["id"] || c["dueAt"] != review.Card["dueAt"] || c["reviewCount"] != review.Card["reviewCount"] {
		t.Fatal("migration must preserve schedule and review count")
	}
	var snapshot string
	if err := f.db.Pool.QueryRow(ctx, "SELECT deck_id_snapshot::text FROM anki_reviews WHERE card_id=$1", cardID).Scan(&snapshot); err != nil || snapshot != firstDeck["id"] {
		t.Fatal("review history must retain original deck")
	}
	// Foreign user's deck must not be accepted; failed mutation preserves current version.
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	w = f.anki(t, "POST", "/api/v1/anki/categories", bob, `{"name":"bob"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &category)
	w = f.anki(t, "POST", "/api/v1/anki/decks", bob, `{"categoryId":"`+category["id"].(string)+`","name":"foreign"}`)
	requireStatus(t, w, 200)
	var foreign map[string]any
	decode(t, w.Body.String(), &foreign)
	w = f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, `{"deckId":"`+foreign["id"].(string)+`","question":"q","answer":"a","resetProgress":false,"version":3}`)
	requireStatus(t, w, 404)
	// Explicit relearn changes schedule but never deletes the original review.
	w = f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, `{"question":"q","answer":"a","resetProgress":true,"version":3}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if c["reviewCount"].(float64) != 0 || count(t, f.db, "anki_reviews") != 1 {
		t.Fatal("relearn must reset state and preserve history")
	}
}

func TestAnkiOAuthReturn(t *testing.T) {
	for _, destination := range []string{"/anki", "/Blog/anki"} {
		t.Run(destination, func(t *testing.T) {
			f := setup(t)
			w := f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(destination), "", "", "")
			requireStatus(t, w, 302)
			u, err := url.Parse(w.Header().Get("Location"))
			if err != nil {
				t.Fatal(err)
			}
			state := u.Query().Get("state")
			cookie := w.Result().Cookies()[0]
			w = f.request("GET", "/api/v1/auth/github/callback?code=code&state="+state, cookie.Name+"="+cookie.Value, "", "")
			requireStatus(t, w, 302)
			if w.Header().Get("Location") != destination {
				t.Fatal("login must return to Anki")
			}
		})
	}
	f := setup(t)
	for _, bad := range []string{"https://evil.example/anki", "//evil.example/anki", "/Blog/anki?next=evil", "/anki#x", "/Blog/anki/../admin"} {
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?return_to="+url.QueryEscape(bad), "", "", ""), 400)
	}
}

func TestAnkiLongTextValidation(t *testing.T) {
	if _, ok := ankiText(json.RawMessage(`"` + strings.Repeat("问", 3000) + `"`)); !ok {
		t.Fatal("valid long question rejected")
	}
	if _, ok := ankiText(json.RawMessage(`"` + strings.Repeat("答", 10001) + `"`)); ok {
		t.Fatal("oversize answer accepted")
	}
}

func decode(t *testing.T, body string, v any) {
	t.Helper()
	if err := json.Unmarshal([]byte(body), v); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
}
