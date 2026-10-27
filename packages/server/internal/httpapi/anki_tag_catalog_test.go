package httpapi

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"github.com/Marvel-L/Blog/packages/server/migrations"
)

func TestAnkiManagedTagsLifecycle(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var cat, deck struct{ ID string }
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"tags"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &cat)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+cat.ID+`","name":"Go"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	path := "/api/v1/anki/decks/" + deck.ID + "/tags"
	// 匿名与越权接口都必须拒绝。
	requireStatus(t, f.anki(t, "GET", path, "", ""), 401)
	var gc, slice store.AnkiTag
	for _, item := range []struct {
		name   string
		target *store.AnkiTag
	}{{"GC", &gc}, {"slice", &slice}} {
		w = f.anki(t, "POST", path, cookie, `{"name":"`+item.name+`"}`)
		requireStatus(t, w, 200)
		decode(t, w.Body.String(), item.target)
	}
	requireStatus(t, f.anki(t, "POST", path, cookie, `{"name":" Gc "}`), 409)
	requireStatus(t, f.anki(t, "POST", path, cookie, `{"name":""}`), 400)
	cardsPath := "/api/v1/anki/decks/" + deck.ID + "/cards"
	requireStatus(t, f.anki(t, "POST", cardsPath, cookie, `{"question":"q","answer":"a","tags":["new"]}`), 400)
	var c store.AnkiCard
	w = f.anki(t, "POST", cardsPath, cookie, `{"question":"q","answer":"a","tags":["Gc"]}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if !reflect.DeepEqual(c.Tags, []string{"GC"}) {
		t.Fatal("card must use canonical name")
	}
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, fmt.Sprintf(`{"cardId":%q,"version":1,"mutationId":%q,"rating":"correct"}`, c.ID, mustUUID()))
	requireStatus(t, w, 200)
	var reviewed struct{ Card store.AnkiCard }
	decode(t, w.Body.String(), &reviewed)
	requireStatus(t, f.anki(t, "PATCH", path+"/"+gc.ID, cookie, `{"name":"SLICE"}`), 409)
	f.identity.ID = "200"
	f.identity.Login = "bob"
	bob := f.login(t, "")
	requireStatus(t, f.anki(t, "GET", path, bob, ""), 404)
	requireStatus(t, f.anki(t, "POST", path, bob, `{"name":"x"}`), 404)
	requireStatus(t, f.anki(t, "PATCH", path+"/"+gc.ID, bob, `{"name":"stolen"}`), 404)
	requireStatus(t, f.anki(t, "DELETE", path+"/"+gc.ID, bob, ""), 404)
	w = f.anki(t, "PATCH", path+"/"+gc.ID, cookie, `{"name":"垃圾回收"}`)
	requireStatus(t, w, 200)
	readCard := func() store.AnkiCard {
		w := f.anki(t, "GET", cardsPath, cookie, "")
		requireStatus(t, w, 200)
		var list struct{ Cards []store.AnkiCard }
		decode(t, w.Body.String(), &list)
		if len(list.Cards) != 1 {
			t.Fatal("tag operation deleted card")
		}
		return list.Cards[0]
	}
	c = readCard()
	if !reflect.DeepEqual(c.Tags, []string{"垃圾回收"}) || !c.DueAt.Equal(reviewed.Card.DueAt) || c.ReviewCount != reviewed.Card.ReviewCount || c.Version != 3 {
		t.Fatal("rename changed schedule or failed to invalidate stale edit")
	}
	requireStatus(t, f.anki(t, "PATCH", "/api/v1/anki/cards/"+c.ID, cookie, `{"question":"q","answer":"a","tags":["GC"],"version":2,"resetProgress":false}`), 409)
	requireStatus(t, f.anki(t, "DELETE", path+"/"+gc.ID, cookie, ""), 200)
	c = readCard()
	if len(c.Tags) != 0 || c.Version != 4 || !c.DueAt.Equal(reviewed.Card.DueAt) || count(t, f.db, "anki_reviews") != 1 {
		t.Fatal("delete must only remove tag and preserve progress/history")
	}
	requireStatus(t, f.anki(t, "PATCH", "/api/v1/anki/cards/"+c.ID, cookie, `{"question":"q","answer":"a","tags":["GC"],"version":4,"resetProgress":false}`), 400)
	w = f.anki(t, "GET", path, cookie, "")
	requireStatus(t, w, 200)
	var list struct{ Tags []store.AnkiTag }
	decode(t, w.Body.String(), &list)
	if len(list.Tags) != 1 || list.Tags[0].Name != "slice" || list.Tags[0].CardCount != 0 {
		t.Fatal("unused tag must remain in catalog")
	}
	// 并发创建大小写变体只有一个成功。
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, name := range []string{"GMP", "gmp"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			codes <- f.request("POST", path, cookie, `{"name":"`+name+`"}`, cfg.Origin).Code
		}(name)
	}
	wg.Wait()
	close(codes)
	counts := map[int]int{}
	for code := range codes {
		counts[code]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("case duplicates not serialized %v", counts)
	}
}

func TestAnkiTagCatalogMigrationCanonicalizesOldCards(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var cat, deck struct{ ID string }
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"migrate"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &cat)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+cat.ID+`","name":"Go"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	path := "/api/v1/anki/decks/" + deck.ID
	var c store.AnkiCard
	w = f.anki(t, "POST", path+"/cards", cookie, `{"question":"keep","answer":"a"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	exec(t, f.db, `DROP TABLE anki_deck_tags; DELETE FROM schema_migrations WHERE name='008_anki_tag_catalog.sql';`)
	if _, err := f.db.Pool.Exec(ctx, `UPDATE anki_cards SET tags=ARRAY['Gc','GC','slice'] WHERE id=$1`, c.ID); err != nil {
		t.Fatal(err)
	}
	url := f.db.Pool.Config().ConnConfig.ConnString()
	if err := migrations.Run(ctx, url); err != nil {
		t.Fatal(err)
	}
	w = f.anki(t, "GET", path+"/cards", cookie, "")
	requireStatus(t, w, 200)
	var cards struct{ Cards []store.AnkiCard }
	decode(t, w.Body.String(), &cards)
	if len(cards.Cards) != 1 || !reflect.DeepEqual(cards.Cards[0].Tags, []string{"GC", "slice"}) || cards.Cards[0].Version != c.Version || !cards.Cards[0].DueAt.Equal(c.DueAt) {
		t.Fatal("migration must merge only tag names")
	}
	w = f.anki(t, "GET", path+"/tags", cookie, "")
	requireStatus(t, w, 200)
	var tags struct{ Tags []store.AnkiTag }
	if err := json.Unmarshal(w.Body.Bytes(), &tags); err != nil {
		t.Fatal(err)
	}
	if len(tags.Tags) != 2 {
		t.Fatal("case variants must become one tag")
	}
	if err := migrations.Run(ctx, url); err != nil {
		t.Fatal(err)
	}
	if count(t, f.db, "anki_deck_tags") != 2 {
		t.Fatal("replay duplicated tags")
	}
}
