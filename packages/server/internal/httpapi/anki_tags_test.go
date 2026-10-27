package httpapi

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"github.com/Marvel-L/Blog/packages/server/migrations"
)

func TestAnkiTagsValidation(t *testing.T) {
	valid := []struct {
		raw  string
		want []string
	}{
		{`[" GMP ","gmp","GC","基础语法","slice"]`, []string{"GMP", "GC", "基础语法", "slice"}},
		{`[]`, []string{}},
	}
	for _, item := range valid {
		got, ok := ankiTags(json.RawMessage(item.raw))
		if !ok || !reflect.DeepEqual(got, item.want) {
			t.Fatalf("normalize tags: %v %v", got, ok)
		}
	}
	got, ok := ankiTags(nil)
	if !ok || got != nil {
		t.Fatal("omitted tags must preserve old values")
	}
	for _, raw := range []string{`null`, `"GMP"`, `[1]`, `[null]`, `[""]`, `["   "]`, `["GC,GMP"]`, `["a\nb"]`, `["a\tb"]`, `["` + strings.Repeat("字", 31) + `"]`, `[` + strings.Repeat(`"x",`, 20) + `"x"]`} {
		if _, ok := ankiTags(json.RawMessage(raw)); ok {
			t.Fatalf("accepted invalid tags %s", raw)
		}
	}
}

func TestAnkiTagsLifecycleAndIsolation(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	var cat, deck struct{ ID string }
	w := f.anki(t, "POST", "/api/v1/anki/categories", cookie, `{"name":"语言"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &cat)
	w = f.anki(t, "POST", "/api/v1/anki/decks", cookie, `{"categoryId":"`+cat.ID+`","name":"Golang"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &deck)
	path := "/api/v1/anki/decks/" + deck.ID + "/cards"
	for _, name := range []string{"GMP", "GC", "slice"} {
		requireStatus(t, f.anki(t, "POST", "/api/v1/anki/decks/"+deck.ID+"/tags", cookie, `{"name":"`+name+`"}`), 200)
	}
	var c store.AnkiCard
	w = f.anki(t, "POST", path, cookie, `{"question":"q","answer":"==a==","tags":["GMP","gmp","GC"]}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if !reflect.DeepEqual(c.Tags, []string{"GMP", "GC"}) {
		t.Fatalf("tags not persisted %+v", c)
	}
	for _, suffix := range []string{"cards", "queue"} {
		w = f.anki(t, "GET", "/api/v1/anki/decks/"+deck.ID+"/"+suffix, cookie, "")
		requireStatus(t, w, 200)
		var list struct{ Cards []store.AnkiCard }
		decode(t, w.Body.String(), &list)
		if len(list.Cards) != 1 || !reflect.DeepEqual(list.Cards[0].Tags, c.Tags) {
			t.Fatalf("tags missing on %s", suffix)
		}
	}
	w = f.anki(t, "POST", "/api/v1/anki/reviews", cookie, `{"cardId":"`+c.ID+`","version":1,"mutationId":"`+mustUUID()+`","rating":"correct"}`)
	requireStatus(t, w, 200)
	var reviewed struct{ Card store.AnkiCard }
	decode(t, w.Body.String(), &reviewed)
	if !reflect.DeepEqual(reviewed.Card.Tags, c.Tags) {
		t.Fatal("review lost tags")
	}
	patchPath := "/api/v1/anki/cards/" + c.ID
	w = f.anki(t, "PATCH", patchPath, cookie, `{"question":"q","answer":"a","resetProgress":false,"version":2}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if !reflect.DeepEqual(c.Tags, reviewed.Card.Tags) || !c.DueAt.Equal(reviewed.Card.DueAt) || c.ReviewCount != 1 {
		t.Fatal("old client must preserve tags and schedule")
	}
	w = f.anki(t, "PATCH", patchPath, cookie, `{"question":"q","answer":"a","tags":["slice"],"resetProgress":false,"version":3}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if !reflect.DeepEqual(c.Tags, []string{"slice"}) || !c.DueAt.Equal(reviewed.Card.DueAt) || count(t, f.db, "anki_reviews") != 1 {
		t.Fatal("editing tags must not reset progress or history")
	}
	requireStatus(t, f.anki(t, "PATCH", patchPath, cookie, `{"question":"q","answer":"a","tags":[],"resetProgress":false,"version":3}`), 409)
	requireStatus(t, f.anki(t, "POST", path, cookie, `{"question":"q","answer":"a","tags":[null]}`), 400)
	requireStatus(t, f.anki(t, "PATCH", patchPath, cookie, `{"question":"q","answer":"a","tags":null,"resetProgress":false,"version":4}`), 400)
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	requireStatus(t, f.anki(t, "GET", path, bob, ""), 404)
	requireStatus(t, f.anki(t, "PATCH", patchPath, bob, `{"question":"q","answer":"a","tags":["stolen"],"resetProgress":false,"version":4}`), 404)
	w = f.anki(t, "PATCH", patchPath, cookie, `{"question":"q","answer":"a","tags":[],"resetProgress":false,"version":4}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if c.Tags == nil || len(c.Tags) != 0 {
		t.Fatal("explicit empty array must clear tags, not serialize null")
	}
	w = f.anki(t, "POST", path, cookie, `{"question":"legacy","answer":"a"}`)
	requireStatus(t, w, 200)
	decode(t, w.Body.String(), &c)
	if c.Tags == nil || len(c.Tags) != 0 {
		t.Fatal("legacy new cards must have empty array")
	}
	// 模拟 006 旧库升级：只能在本测试随机 schema 内执行，检查既有文本/排期/历史不变。
	legacy := c
	exec(t, f.db, `ALTER TABLE anki_cards DROP COLUMN tags; DELETE FROM schema_migrations WHERE name='007_anki_tags.sql';`)
	databaseURL := f.db.Pool.Config().ConnConfig.ConnString()
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	w = f.anki(t, "GET", path, cookie, "")
	requireStatus(t, w, 200)
	var upgraded struct{ Cards []store.AnkiCard }
	decode(t, w.Body.String(), &upgraded)
	for _, card := range upgraded.Cards {
		if card.Tags == nil || len(card.Tags) != 0 {
			t.Fatal("old cards need empty tags after migration")
		}
		if card.ID == legacy.ID && (card.Question != legacy.Question || !card.DueAt.Equal(legacy.DueAt) || card.Version != legacy.Version) {
			t.Fatal("migration changed old content or schedule")
		}
	}
	before := count(t, f.db, "schema_migrations")
	if err := migrations.Run(ctx, databaseURL); err != nil {
		t.Fatal(err)
	}
	if count(t, f.db, "schema_migrations") != before || count(t, f.db, "anki_reviews") != 1 {
		t.Fatal("rerun changed migrations or history")
	}
}
