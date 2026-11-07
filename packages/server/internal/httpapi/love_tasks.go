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

type loveTaskPersistence interface {
	LoveTasks(context.Context, string) (store.LoveTaskSnapshot, error)
	SaveLoveTasks(context.Context, string, int64, string, json.RawMessage) (store.LoveTaskSnapshot, bool, error)
}

func validLoveTasks(raw json.RawMessage) bool {
	var header map[string]json.RawMessage
	if json.Unmarshal(raw, &header) != nil {
		return false
	}
	ids := map[string]bool{}
	if string(header["version"]) == "1" {
		m, err := fields(raw, "version", "tasks")
		var tasks []json.RawMessage
		return err == nil && string(m["tasks"]) != "null" &&
			json.Unmarshal(m["tasks"], &tasks) == nil && len(tasks) <= 1000 &&
			validLoveChildren(tasks, ids)
	}
	m, err := fields(raw, "version", "groups")
	var groups []json.RawMessage
	if err != nil || string(m["version"]) != "2" || string(m["groups"]) == "null" ||
		json.Unmarshal(m["groups"], &groups) != nil || len(groups) > 1000 {
		return false
	}
	total := 0
	for _, group := range groups {
		f, err := fields(group, "id", "text", "note", "createdOn", "tasks")
		var tasks []json.RawMessage
		if err != nil || !validLoveRecord(f, ids) || string(f["tasks"]) == "null" ||
			json.Unmarshal(f["tasks"], &tasks) != nil || len(tasks) == 0 || len(tasks) > 100 ||
			!validLoveChildren(tasks, ids) {
			return false
		}
		total += len(tasks)
		if total > 5000 {
			return false
		}
	}
	return true
}

func validLoveRecord(f map[string]json.RawMessage, ids map[string]bool) bool {
	for _, key := range []string{"id", "text", "note", "createdOn"} {
		if f[key] == nil || string(f[key]) == "null" {
			return false
		}
	}
	var id, text, note string
	if json.Unmarshal(f["id"], &id) != nil || !uuidPattern.MatchString(id) ||
		ids[strings.ToLower(id)] || json.Unmarshal(f["text"], &text) != nil || text == "" ||
		strings.TrimSpace(text) != text || len([]rune(text)) > 120 ||
		json.Unmarshal(f["note"], &note) != nil || len([]rune(note)) > 2000 {
		return false
	}
	for _, r := range text {
		if unicode.IsControl(r) {
			return false
		}
	}
	for _, r := range note {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return false
		}
	}
	if _, ok := plannerDate(f["createdOn"], false); !ok {
		return false
	}
	ids[strings.ToLower(id)] = true
	return true
}

func validLoveChildren(tasks []json.RawMessage, ids map[string]bool) bool {
	for _, task := range tasks {
		var f map[string]json.RawMessage
		if json.Unmarshal(task, &f) != nil || len(f) != 5 || f["completedOn"] == nil || !validLoveRecord(f, ids) {
			return false
		}
		created, _ := plannerDate(f["createdOn"], false)
		completed, completedOK := plannerDate(f["completedOn"], true)
		if !completedOK || (completed != "" && completed < created) {
			return false
		}
	}
	return true
}

func (a *API) loveTasks(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	db, ok := a.db.(loveTaskPersistence)
	if !ok {
		failure(w, 503)
		return
	}
	if r.Method == "GET" {
		v, err := db.LoveTasks(r.Context(), u.ID)
		if err != nil {
			failure(w, 503)
			return
		}
		respond(w, 200, map[string]any{"user": u, "tasks": v})
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
		!uuidPattern.MatchString(mutation) || !validLoveTasks(m["state"]) {
		failure(w, 400)
		return
	}
	v, conflict, err := db.SaveLoveTasks(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"])
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
	respond(w, status, map[string]any{"user": u, "tasks": v})
}
