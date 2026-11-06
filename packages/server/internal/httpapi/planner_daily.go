package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func plannerDate(raw json.RawMessage, nullable bool) (string, bool) {
	if nullable && string(raw) == "null" {
		return "", true
	}
	var value string
	if json.Unmarshal(raw, &value) != nil || len(value) != 10 || value[:4] < "1970" {
		return "", false
	}
	date, err := time.Parse("2006-01-02", value)
	return value, err == nil && date.Format("2006-01-02") == value
}

func validDailyPlanner(raw json.RawMessage) bool {
	m, err := fields(raw, "version", "tasks")
	if err != nil || string(m["version"]) != "1" {
		return false
	}
	var tasks []json.RawMessage
	if string(m["tasks"]) == "null" || json.Unmarshal(m["tasks"], &tasks) != nil || len(tasks) > 1000 {
		return false
	}
	seen := map[string]bool{}
	for _, rawTask := range tasks {
		var t map[string]json.RawMessage
		if json.Unmarshal(rawTask, &t) != nil || len(t) != 7 {
			return false
		}
		for _, key := range []string{"id", "text", "date", "note", "priority", "scheduledFor", "completedOn"} {
			if t[key] == nil {
				return false
			}
			if key != "scheduledFor" && key != "completedOn" && string(t[key]) == "null" {
				return false
			}
		}
		id, ok := text(t["id"])
		if !ok || len(id) == 0 || len(id) > 120 || seen[id] {
			return false
		}
		for _, char := range id {
			if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '_' || char == '-') {
				return false
			}
		}
		seen[id] = true
		content, ok := plannerText(t["text"])
		if !ok || strings.TrimSpace(content) == "" {
			return false
		}
		var note, priority string
		if json.Unmarshal(t["note"], &note) != nil || len(utf16.Encode([]rune(note))) > 1000 || json.Unmarshal(t["priority"], &priority) != nil || (priority != "normal" && priority != "high") {
			return false
		}
		date, valid := plannerDate(t["date"], false)
		scheduled, validSchedule := plannerDate(t["scheduledFor"], true)
		completed, validCompleted := plannerDate(t["completedOn"], true)
		if !valid || !validSchedule || !validCompleted || (scheduled != "" && scheduled < date) || (completed != "" && completed < date) {
			return false
		}
	}
	return true
}

func (a *API) dailyPlanner(w http.ResponseWriter, r *http.Request) {
	u, err := a.plannerUser(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	if !requireGitHub(w, u) {
		return
	}
	if r.Method == "GET" {
		v, err := a.db.DailyPlanner(r.Context(), u.ID)
		if err != nil {
			failure(w, 503)
			return
		}
		respond(w, 200, map[string]any{"user": u, "planner": v})
		return
	}
	raw, ok := jsonBody(w, r, 3*1024*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "baseRevision", "mutationId", "state")
	var base int64
	var mutation string
	if err != nil || json.Unmarshal(m["baseRevision"], &base) != nil || base < 0 || base >= 9007199254740991 || json.Unmarshal(m["mutationId"], &mutation) != nil || !uuidPattern.MatchString(mutation) || !validDailyPlanner(m["state"]) {
		failure(w, 400)
		return
	}
	v, conflict, err := a.db.SaveDailyPlanner(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"])
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
	respond(w, status, map[string]any{"user": u, "planner": v})
}
