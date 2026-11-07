package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type articleReadingPersistence interface {
	ArticleReading(context.Context, string) (store.ArticleReadingSnapshot, error)
	SaveArticleReading(context.Context, string, int64, string, json.RawMessage) (store.ArticleReadingSnapshot, bool, error)
}

func validArticleReading(raw json.RawMessage) bool {
	m, err := fields(raw, "version", "preferences", "events")
	version := string(m["version"])
	if err != nil || (version != "1" && version != "2") {
		return false
	}
	var preferences, events []json.RawMessage
	if string(m["preferences"]) == "null" || string(m["events"]) == "null" ||
		json.Unmarshal(m["preferences"], &preferences) != nil || json.Unmarshal(m["events"], &events) != nil ||
		len(preferences) > 5000 || len(events) > 20000 {
		return false
	}
	validID := func(id string) bool {
		if id == "" || len([]rune(id)) > 240 {
			return false
		}
		for _, r := range id {
			if unicode.IsSpace(r) || unicode.IsControl(r) || strings.ContainsRune("/\\?#", r) {
				return false
			}
		}
		return true
	}
	posts := map[string]bool{}
	for _, p := range preferences {
		keys := []string{"postId", "interest"}
		if version == "1" {
			keys = append(keys, "reviewInterval", "reviewFrom")
		}
		var f map[string]json.RawMessage
		if json.Unmarshal(p, &f) != nil || len(f) != len(keys) {
			return false
		}
		for _, key := range keys {
			if f[key] == nil {
				return false
			}
		}
		otherInterest := "seen"
		if version == "1" {
			otherInterest = "none"
		}
		var id, interest string
		if json.Unmarshal(f["postId"], &id) != nil || !validID(id) || posts[id] ||
			json.Unmarshal(f["interest"], &interest) != nil ||
			(interest != "want" && interest != "skip" && interest != otherInterest) {
			return false
		}
		if version == "1" {
			var interval int
			if string(f["reviewInterval"]) == "null" || json.Unmarshal(f["reviewInterval"], &interval) != nil || (interval != 0 && interval != 7 && interval != 14 && interval != 30) {
				return false
			}
			date, ok := plannerDate(f["reviewFrom"], true)
			if !ok || (interval == 0 && date != "") || (interval != 0 && date == "") {
				return false
			}
		}
		posts[id] = true
	}
	ids, days := map[string]bool{}, map[string]bool{}
	for _, e := range events {
		keys := []string{"id", "postId", "day", "undone"}
		var extra map[string]json.RawMessage
		if json.Unmarshal(e, &extra) != nil {
			return false
		}
		if version == "2" && extra["previousInterest"] != nil {
			keys = append(keys, "previousInterest")
			var interest string
			if json.Unmarshal(extra["previousInterest"], &interest) != nil || (interest != "want" && interest != "seen" && interest != "skip") {
				return false
			}
		}
		f, err := fields(e, keys...)
		var id, postID string
		var undone bool
		if err != nil || json.Unmarshal(f["id"], &id) != nil || !uuidPattern.MatchString(id) || ids[strings.ToLower(id)] ||
			json.Unmarshal(f["postId"], &postID) != nil || !posts[postID] || string(f["undone"]) == "null" || json.Unmarshal(f["undone"], &undone) != nil {
			return false
		}
		day, ok := plannerDate(f["day"], false)
		key := postID + ":" + day
		if !ok || (!undone && days[key]) {
			return false
		}
		ids[strings.ToLower(id)] = true
		if !undone {
			days[key] = true
		}
	}
	return true
}

func (a *API) articleReading(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	db, ok := a.db.(articleReadingPersistence)
	if !ok {
		failure(w, 503)
		return
	}
	if r.Method == "GET" {
		v, err := db.ArticleReading(r.Context(), u.ID)
		if err != nil {
			failure(w, 503)
			return
		}
		respond(w, 200, map[string]any{"user": u, "reading": v})
		return
	}
	raw, ok := jsonBody(w, r, 4*1024*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "baseRevision", "mutationId", "state")
	var base int64
	var mutation string
	if err != nil || string(m["baseRevision"]) == "null" || json.Unmarshal(m["baseRevision"], &base) != nil ||
		base < 0 || base >= 9007199254740991 || json.Unmarshal(m["mutationId"], &mutation) != nil ||
		!uuidPattern.MatchString(mutation) || !validArticleReading(m["state"]) {
		failure(w, 400)
		return
	}
	v, conflict, err := db.SaveArticleReading(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"])
	if errors.Is(err, store.ErrMutationReuse) {
		failure(w, 400)
		return
	}
	if err != nil {
		failure(w, 503)
		return
	}
	status := 200
	if conflict {
		status = 409
	}
	respond(w, status, map[string]any{"user": u, "reading": v})
}
