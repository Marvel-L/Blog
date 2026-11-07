package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"net/http"
	"strings"
	"time"
	"unicode"
)

type confessionPersistence interface {
	Confessions(context.Context, string) (store.ConfessionSnapshot, error)
	SaveConfessions(context.Context, string, int64, string, json.RawMessage) (store.ConfessionSnapshot, bool, error)
}

func confessionText(raw json.RawMessage, max int, multiline bool) (string, bool) {
	var text string
	if string(raw) == "null" || json.Unmarshal(raw, &text) != nil || strings.TrimSpace(text) == "" || len([]rune(text)) > max {
		return "", false
	}
	for _, r := range text {
		if unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\r' || r == '\t')) {
			return "", false
		}
	}
	return text, true
}
func validConfessions(raw json.RawMessage) bool {
	m, err := fields(raw, "version", "categories", "entries")
	var categories, entries []json.RawMessage
	if err != nil || string(m["version"]) != "1" || string(m["categories"]) == "null" || string(m["entries"]) == "null" || json.Unmarshal(m["categories"], &categories) != nil || json.Unmarshal(m["entries"], &entries) != nil || len(categories) > 100 || len(entries) > 2000 {
		return false
	}
	ids := map[string]bool{}
	categoryIDs := map[string]bool{}
	names := map[string]bool{}
	for _, raw := range categories {
		f, err := fields(raw, "id", "name")
		var id string
		name, ok := confessionText(f["name"], 24, false)
		if err != nil || json.Unmarshal(f["id"], &id) != nil || !uuidPattern.MatchString(id) || ids[strings.ToLower(id)] || !ok || name != strings.TrimSpace(name) || names[name] {
			return false
		}
		id = strings.ToLower(id)
		ids[id] = true
		categoryIDs[id] = true
		names[name] = true
	}
	for _, raw := range entries {
		f, err := fields(raw, "id", "categoryId", "content", "createdAt")
		var id, categoryID, createdAt string
		_, ok := confessionText(f["content"], 10000, true)
		if err != nil || json.Unmarshal(f["id"], &id) != nil || !uuidPattern.MatchString(id) || ids[strings.ToLower(id)] || json.Unmarshal(f["categoryId"], &categoryID) != nil || !categoryIDs[strings.ToLower(categoryID)] || !ok || json.Unmarshal(f["createdAt"], &createdAt) != nil || !strings.HasSuffix(createdAt, "Z") {
			return false
		}
		if _, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
			return false
		}
		ids[strings.ToLower(id)] = true
	}
	return true
}
func (a *API) confessions(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	db, ok := a.db.(confessionPersistence)
	if !ok {
		failure(w, 503)
		return
	}
	if r.Method == "GET" {
		v, err := db.Confessions(r.Context(), u.ID)
		if err != nil {
			failure(w, 503)
			return
		}
		respond(w, 200, map[string]any{"user": u, "archive": v})
		return
	}
	raw, ok := jsonBody(w, r, 2*1024*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "baseRevision", "mutationId", "state")
	var base int64
	var mutation string
	if err != nil || string(m["baseRevision"]) == "null" || json.Unmarshal(m["baseRevision"], &base) != nil || base < 0 || base >= 9007199254740991 || json.Unmarshal(m["mutationId"], &mutation) != nil || !uuidPattern.MatchString(mutation) || !validConfessions(m["state"]) {
		failure(w, 400)
		return
	}
	v, conflict, err := db.SaveConfessions(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"])
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
	respond(w, status, map[string]any{"user": u, "archive": v})
}
