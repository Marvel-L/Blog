package httpapi

import (
	"fmt"
	"github.com/Marvel-L/Blog/packages/server/migrations"
	"sync"
	"testing"
)

func TestAnkiActivePracticeCountsAndIsolation(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var category, deck, card map[string]any
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"主动练习"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &category)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category["id"].(string)+`","name":"test"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	w = f.anki(t, "POST", "/api/v1/anki/decks/"+deck["id"].(string)+"/cards", cookie, `{"question":"q","answer":"a"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &card)
	id := card["id"].(string)
	if card["practiceCount"].(float64) != 0 {
		t.Fatal("fresh card must have zero lifetime count")
	}

	payload := func(version int, key, rating string) string {
		return fmt.Sprintf(`{"cardId":%q,"version":%d,"mutationId":%q,"rating":%q}`, id, version, key, rating)
	}
	readCard := func(body string) map[string]any {
		var out struct {
			Card map[string]any `json:"card"`
		}
		decode(t, body, &out)
		return out.Card
	}
	first := payload(1, "00000000-0000-4000-8000-000000000001", "correct")
	w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, first)
	requireStatus(t, w, 200)
	card = readCard(w.Body.String())
	if card["practiceCount"].(float64) != 1 || card["correctCount"].(float64) != 1 || card["intervalDays"].(float64) != 1 {
		t.Fatalf("first practice: %v", card)
	}
	// 旧到期入口仍拒绝未来卡；主动练习则允许提前，版本/幂等规则不能绕过。
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, payload(2, "00000000-0000-4000-8000-000000000002", "hard"))
	requireStatus(t, w, 409)
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, first)
	requireStatus(t, w, 400)
	w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, first)
	requireStatus(t, w, 200)
	if readCard(w.Body.String())["practiceCount"].(float64) != 1 {
		t.Fatal("replay incremented lifetime count")
	}

	second := payload(2, "00000000-0000-4000-8000-000000000003", "hard")
	const parallel = 6
	codes := make(chan int, parallel)
	var wg sync.WaitGroup
	for i := 0; i < parallel; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- f.request("POST", "/api/v1/anki/practice", cookie, second, cfg.Origin).Code
		}()
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 {
			t.Fatalf("replay status %d", code)
		}
	}
	w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, second)
	requireStatus(t, w, 200)
	card = readCard(w.Body.String())
	if card["practiceCount"].(float64) != 2 || card["hardCount"].(float64) != 1 || card["intervalDays"].(float64) != 6 {
		t.Fatalf("early practice: %v", card)
	}
	w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, payload(2, "00000000-0000-4000-8000-000000000004", "wrong"))
	requireStatus(t, w, 409)
	w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, payload(3, "00000000-0000-4000-8000-000000000005", "wrong"))
	requireStatus(t, w, 200)
	card = readCard(w.Body.String())
	if card["practiceCount"].(float64) != 3 || card["wrongCount"].(float64) != 1 || card["repetitions"].(float64) != 0 {
		t.Fatal("wrong result not persisted")
	}
	// 当前学习周期重置；终身计数和历史不得删除。
	w = f.anki(t, "PATCH", "/api/v1/anki/cards/"+id, cookie, `{"question":"q2","answer":"a2","version":4,"resetProgress":true}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &card)
	if card["reviewCount"].(float64) != 0 || card["practiceCount"].(float64) != 3 || count(t, f.db, "anki_reviews") != 3 {
		t.Fatal("relearn deleted lifetime counts")
	}
	// 自定义仍是独立结果，不推断为熟悉/模糊/忘记。
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, fmt.Sprintf(`{"cardId":%q,"version":5,"mutationId":"00000000-0000-4000-8000-000000000008","customDays":7}`, id))
	requireStatus(t, w, 200)
	card = readCard(w.Body.String())
	if card["practiceCount"].(float64) != 4 || card["customCount"].(float64) != 1 || card["correctCount"].(float64) != 1 {
		t.Fatal("custom count mixed with ratings")
	}
	var reviews, unique int
	if err := f.db.Pool.QueryRow(ctx, "SELECT reviews,unique_cards FROM anki_daily_stats").Scan(&reviews, &unique); err != nil || reviews != 4 || unique != 1 {
		t.Fatal("active practice daily dedup wrong")
	}
	w = f.anki(t, "POST", "/api/v1/anki/practice", "", payload(6, "00000000-0000-4000-8000-000000000006", "correct"))
	requireStatus(t, w, 401)
	f.identity.ID = "200"
	f.identity.Login = "bob"
	bob := f.login(t, "")
	w = f.anki(t, "POST", "/api/v1/anki/practice", bob, payload(5, "00000000-0000-4000-8000-000000000007", "correct"))
	requireStatus(t, w, 404)
}

func TestAnkiCountMigrationBackfillsImmutableHistory(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var category, deck, card map[string]any
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"历史"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &category)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category["id"].(string)+`","name":"history"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	w = f.anki(t, "POST", "/api/v1/anki/decks/"+deck["id"].(string)+"/cards", cookie, `{"question":"keep q","answer":"keep a"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &card)
	id := card["id"].(string)
	var userID string
	if err := f.db.Pool.QueryRow(ctx, "SELECT user_id::text FROM anki_cards WHERE id=$1", id).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	for i, rating := range []string{"correct", "hard", "wrong", "custom"} {
		_, err := f.db.Pool.Exec(ctx, `INSERT INTO anki_reviews(user_id,mutation_id,card_id,card_version,rating,review_date) VALUES($1,$2,$3,1,$4,current_date)`, userID, fmt.Sprintf("00000000-0000-4000-8000-%012d", i+100), id, rating)
		if err != nil {
			t.Fatal(err)
		}
	}
	// 还原到 005 形态，只在此测试随机 schema 内执行，模拟带历史的旧库升级。
	exec(t, f.db, `ALTER TABLE anki_cards DROP COLUMN practice_count,DROP COLUMN correct_count,DROP COLUMN hard_count,DROP COLUMN wrong_count,DROP COLUMN custom_count;
    ALTER TABLE anki_reviews DROP COLUMN review_mode;DROP INDEX anki_reviews_card_results;
    DELETE FROM schema_migrations WHERE name='006_anki_practice_counts.sql';`)
	databaseURL := f.db.Pool.Config().ConnConfig.ConnString()
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	var total, correct, hard, wrong, custom int
	var question, answer string
	if err := f.db.Pool.QueryRow(ctx, `SELECT practice_count,correct_count,hard_count,wrong_count,custom_count,question,answer FROM anki_cards WHERE id=$1`, id).Scan(&total, &correct, &hard, &wrong, &custom, &question, &answer); err != nil {
		t.Fatal(err)
	}
	if total != 4 || correct != 1 || hard != 1 || wrong != 1 || custom != 1 || question != "keep q" || answer != "keep a" {
		t.Fatal("history backfill lost/mixed data")
	}
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	if count(t, f.db, "anki_reviews") != 4 || count(t, f.db, "schema_migrations") != 6 {
		t.Fatal("rerun duplicated history/migration")
	}
}
