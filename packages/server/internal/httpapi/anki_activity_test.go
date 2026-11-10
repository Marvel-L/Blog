package httpapi

import (
	"fmt"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"github.com/Marvel-L/Blog/packages/server/migrations"
)

func activityCard(t *testing.T, f *fixture, cookie string) (string, string) {
	t.Helper()
	var category, deck, card map[string]any
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"编程"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &category)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+category["id"].(string)+`","name":"Go"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	w = f.anki(t, "POST", "/api/v1/anki/decks/"+deck["id"].(string)+"/cards", cookie, `{"question":"原始问题","answer":"不会暴露的答案"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &card)
	return card["id"].(string), deck["id"].(string)
}

func activityDay(t *testing.T, f *fixture, cookie, query string) store.AnkiActivityPage {
	t.Helper()
	w := f.anki(t, "GET", "/api/v1/anki/activity?"+query, cookie, "")
	requireStatus(t, w, 200)
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private activity must not be cached")
	}
	var page store.AnkiActivityPage
	decode(t, w.Body.String(), &page)
	return page
}

func TestAnkiActivitySnapshotsRepeatAndAccountIsolation(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	cardID, _ := activityCard(t, f, cookie)
	for i, rating := range []string{"correct", "hard", "wrong"} {
		payload := fmt.Sprintf(`{"cardId":%q,"version":%d,"mutationId":"00000000-0000-4000-8000-%012d","rating":%q}`, cardID, i+1, i+1, rating)
		w := f.anki(t, "POST", "/api/v1/anki/practice", cookie, payload)
		requireStatus(t, w, 200)
		w = f.anki(t, "POST", "/api/v1/anki/practice", cookie, payload)
		requireStatus(t, w, 200)
	}
	w := f.anki(t, "PATCH", "/api/v1/anki/cards/"+cardID, cookie, `{"question":"修改后的问题","answer":"新答案","version":4,"resetProgress":true}`)
	requireStatus(t, w, 200)
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, fmt.Sprintf(`{"cardId":%q,"version":5,"mutationId":"00000000-0000-4000-8000-000000000004","customDays":7}`, cardID))
	requireStatus(t, w, 200)
	var date string
	if err := f.db.Pool.QueryRow(ctx, "SELECT activity_date::text FROM anki_activity LIMIT 1").Scan(&date); err != nil {
		t.Fatal(err)
	}
	page := activityDay(t, f, cookie, "date="+date)
	if len(page.Entries) != 5 || page.Entries[0].Kind != "create" || page.NextCursor != "" || page.TimeZone != "Asia/Shanghai" {
		t.Fatalf("events missing or replays duplicated: %+v", page)
	}
	for i, entry := range page.Entries {
		if entry.Historical || entry.DeckName != "Go" || entry.CategoryName != "编程" {
			t.Fatalf("incorrect snapshot: %+v", entry)
		}
		if i < 4 && entry.Question != "原始问题" {
			t.Fatal("editing rewrote history")
		}
	}
	if page.Entries[1].Rating != "correct" || page.Entries[2].Rating != "hard" || page.Entries[3].Rating != "wrong" ||
		page.Entries[4].Rating != "custom" || *page.Entries[4].CustomDays != 7 {
		t.Fatal("ratings lost or mixed")
	}
	var mismatches int
	err := f.db.Pool.QueryRow(ctx, `SELECT count(*) FROM anki_activity a JOIN anki_reviews r
	 ON a.user_id=r.user_id AND a.mutation_id=r.mutation_id
	 WHERE a.occurred_at<>r.created_at OR a.activity_date<>(a.occurred_at AT TIME ZONE 'Asia/Shanghai')::date`).Scan(&mismatches)
	if err != nil || mismatches != 0 {
		t.Fatal("review and activity timestamps disagree")
	}
	// 删除卡片/库也不能删掉历史。
	exec(t, f.db, "DELETE FROM anki_categories")
	if len(activityDay(t, f, cookie, "date="+date).Entries) != 5 {
		t.Fatal("deletion erased activity")
	}
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/activity?date="+date, "", ""), 401)
	f.identity.ID, f.identity.Login = "200", "bob"
	bob := f.login(t, "")
	if len(activityDay(t, f, bob, "date="+date).Entries) != 0 {
		t.Fatal("another account saw private activity")
	}
	requireStatus(t, f.anki(t, "GET", "/api/v1/anki/activity?date="+date+"&cursor="+page.Entries[0].ID, bob, ""), 400)
}

func TestAnkiActivityPaginationDatesAndMidnight(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	cardID, _ := activityCard(t, f, cookie)
	_, err := f.db.Pool.Exec(ctx, `INSERT INTO anki_activity(user_id,card_id,kind,mutation_id,activity_date,occurred_at,
	 deck_name,category_name,question,rating)
	 SELECT user_id,id,'review',md5(n::text)::uuid,'2026-01-02','2026-01-01T16:00:00Z'::timestamptz,
	 'Go','编程','重复问题','correct' FROM anki_cards CROSS JOIN generate_series(1,205) n WHERE id=$1`, cardID)
	if err != nil {
		t.Fatal(err)
	}
	first := activityDay(t, f, cookie, "date=2026-01-02")
	if len(first.Entries) != 200 || first.NextCursor == "" {
		t.Fatal("first page not bounded")
	}
	second := activityDay(t, f, cookie, "date=2026-01-02&cursor="+first.NextCursor)
	if len(second.Entries) != 5 || second.NextCursor != "" || first.Entries[199].ID == second.Entries[0].ID {
		t.Fatalf("pagination lost or duplicated events: first cursor %s, second %+v", first.NextCursor, second)
	}
	if len(activityDay(t, f, cookie, "date=2026-01-01").Entries) != 0 {
		t.Fatal("UTC midnight grouping instead of Shanghai")
	}
	for _, query := range []string{"", "date=0000-01-01", "date=2026-02-30", "date=9999-01-01", "date=2026-1-2", "date=2026-01-02&date=2026-01-03",
		"date=2026-01-02&cursor=-1", "date=2026-01-02&cursor=abc", "date=2026-01-02&cursor=999999999", "date=2026-01-01&cursor=" + first.NextCursor} {
		requireStatus(t, f.anki(t, "GET", "/api/v1/anki/activity?"+query, cookie, ""), 400)
	}
}

func TestAnkiActivityTransactionFailureRollsBack(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	cardID, deckID := activityCard(t, f, cookie)
	exec(t, f.db, `CREATE FUNCTION reject_activity() RETURNS trigger LANGUAGE plpgsql AS $$
	 BEGIN RAISE EXCEPTION 'activity failure'; END $$;
	 CREATE TRIGGER reject_activity BEFORE INSERT ON anki_activity FOR EACH ROW EXECUTE FUNCTION reject_activity();`)
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/decks/"+deckID+"/cards", cookie, `{"question":"失败卡片","answer":"答案"}`), 503)
	requireStatus(t, f.anki(t, "POST", "/api/v1/anki/practice", cookie, fmt.Sprintf(`{"cardId":%q,"version":1,"mutationId":"00000000-0000-4000-8000-000000000001","rating":"correct"}`, cardID)), 503)
	if count(t, f.db, "anki_cards") != 1 || count(t, f.db, "anki_reviews") != 0 ||
		count(t, f.db, "anki_daily_stats") != 0 || count(t, f.db, "anki_activity") != 1 {
		t.Fatal("failed activity leaked partial writes")
	}
	var version int
	if err := f.db.Pool.QueryRow(ctx, "SELECT version FROM anki_cards WHERE id=$1", cardID).Scan(&version); err != nil || version != 1 {
		t.Fatal("failed activity advanced card")
	}
}

func TestAnkiActivityMigrationPreservesLegacyRecords(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	cardID, deckID := activityCard(t, f, cookie)
	// 仅还原测试随机 schema 到 015，模拟有重复评价和缺失卡片的旧库。
	exec(t, f.db, `DROP TABLE anki_activity; DELETE FROM schema_migrations WHERE name='016_anki_activity.sql';`)
	_, err := f.db.Pool.Exec(ctx, `INSERT INTO anki_reviews(user_id,mutation_id,card_id,card_version,rating,
	 review_date,created_at,deck_id_snapshot)
	 SELECT user_id,md5(n::text)::uuid,id,1,'hard','2026-01-02','2026-01-01T16:00:00Z',$2 FROM anki_cards
	 CROSS JOIN generate_series(1,2) n WHERE id=$1`, cardID, deckID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.db.Pool.Exec(ctx, `INSERT INTO anki_reviews(user_id,mutation_id,card_id,card_version,rating,review_date)
	 SELECT user_id,'00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000098',1,'wrong','2026-01-02'
	 FROM anki_cards WHERE id=$1`, cardID)
	if err != nil {
		t.Fatal(err)
	}
	databaseURL := f.db.Pool.Config().ConnConfig.ConnString()
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	page := activityDay(t, f, cookie, "date=2026-01-02")
	if len(page.Entries) != 3 || count(t, f.db, "anki_activity") != 4 || count(t, f.db, "anki_reviews") != 3 {
		t.Fatal("backfill duplicated or removed events")
	}
	for _, entry := range page.Entries {
		if !entry.Historical {
			t.Fatal("backfill must not pretend to be original content")
		}
	}
	if page.Entries[2].Question != "历史问题不可用" || page.Entries[2].DeckName != "历史卡片库不可用" {
		t.Fatal("missing history was fabricated")
	}
}
