package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strings"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type mindPersistence interface {
	MindMaps(context.Context, string) ([]store.MindSummary, error)
	MindMap(context.Context, string, string) (store.MindMap, error)
	SaveMindMap(context.Context, string, string, int64, string, json.RawMessage) (store.MindMap, bool, error)
}

var mindColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validMindState(raw json.RawMessage) bool {
	top, err := fields(raw, "version", "title", "layout", "nodes", "viewport")
	var layout string
	var nodes []json.RawMessage
	if err != nil || string(top["version"]) != "1" || !journalText(top["title"], 120, false) ||
		json.Unmarshal(top["layout"], &layout) != nil || (layout != "mind" && layout != "logic") ||
		json.Unmarshal(top["nodes"], &nodes) != nil || len(nodes) == 0 || len(nodes) > 1000 {
		return false
	}
	view, err := fields(top["viewport"], "x", "y", "zoom")
	if err != nil {
		return false
	}
	for _, key := range []string{"x", "y", "zoom"} {
		var value float64
		if string(view[key]) == "null" || json.Unmarshal(view[key], &value) != nil || math.IsNaN(value) || math.IsInf(value, 0) ||
			math.Abs(value) > 1000000 || (key == "zoom" && (value < 0.15 || value > 3)) {
			return false
		}
	}
	parents := map[string]string{}
	markers := map[string]bool{"": true, "✅": true, "❌": true, "⭐": true, "💡": true, "🔥": true, "❓": true, "🎯": true, "🚀": true}
	root := ""
	for _, rawNode := range nodes {
		// parentId is deliberately nullable for the single root. The shared
		// fields helper rejects null and therefore cannot validate this object.
		var node map[string]json.RawMessage
		err := json.Unmarshal(rawNode, &node)
		var id, parent, emoji string
		var side int
		color, hasColor := node["color"]
		if hasColor {
			var hex string
			if json.Unmarshal(color, &hex) != nil || !mindColorPattern.MatchString(hex) {
				return false
			}
		}
		expectedFields := 5
		if hasColor {
			expectedFields++
		}
		if rawCollapsed, exists := node["collapsed"]; exists {
			var collapsed bool
			if string(rawCollapsed) == "null" || json.Unmarshal(rawCollapsed, &collapsed) != nil {
				return false
			}
			expectedFields++
		}
		if err != nil || len(node) != expectedFields || json.Unmarshal(node["id"], &id) != nil || !uuidPattern.MatchString(id) || id != strings.ToLower(id) ||
			!journalText(node["text"], 200, true) || !journalText(node["emoji"], 8, true) || json.Unmarshal(node["emoji"], &emoji) != nil ||
			!markers[emoji] ||
			json.Unmarshal(node["side"], &side) != nil || (side != 1 && side != -1) {
			return false
		}
		if _, exists := parents[id]; exists {
			return false
		}
		if string(node["parentId"]) == "null" {
			if root != "" {
				return false
			}
			root = id
		} else if json.Unmarshal(node["parentId"], &parent) != nil || !uuidPattern.MatchString(parent) {
			return false
		}
		parents[id] = parent
	}
	if root == "" {
		return false
	}
	for id := range parents {
		current := id
		for depth := 0; current != root; depth++ {
			parent, exists := parents[current]
			if !exists || parent == "" || depth >= 32 {
				return false
			}
			current = parent
		}
	}
	return true
}

func (a *API) mindMaps(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	db, ok := a.db.(mindPersistence)
	if !ok {
		failure(w, 503)
		return
	}
	if r.URL.RawQuery != "" {
		failure(w, 400)
		return
	}
	id := strings.ToLower(r.PathValue("id"))
	if id == "" {
		items, err := db.MindMaps(r.Context(), u.ID)
		if err != nil {
			failure(w, 503)
			return
		}
		respond(w, 200, map[string]any{"user": u, "maps": items})
		return
	}
	if !uuidPattern.MatchString(id) {
		failure(w, 400)
		return
	}
	var snapshot store.MindMap
	status := 200
	if r.Method == "GET" {
		snapshot, err = db.MindMap(r.Context(), u.ID, id)
		if err == nil && snapshot.State == nil {
			failure(w, 404)
			return
		}
	} else {
		raw, ok := jsonBody(w, r, 1024*1024)
		if !ok {
			return
		}
		body, parseErr := fields(raw, "baseRevision", "mutationId", "state")
		var base int64
		var mutation string
		if parseErr != nil || string(body["baseRevision"]) == "null" || json.Unmarshal(body["baseRevision"], &base) != nil ||
			base < 0 || base >= 9007199254740991 || json.Unmarshal(body["mutationId"], &mutation) != nil ||
			!uuidPattern.MatchString(mutation) || !validMindState(body["state"]) {
			failure(w, 400)
			return
		}
		var conflict bool
		snapshot, conflict, err = db.SaveMindMap(r.Context(), u.ID, id, base, strings.ToLower(mutation), body["state"])
		if errors.Is(err, store.ErrMutationReuse) {
			failure(w, 400)
			return
		}
		if conflict {
			status = 409
		}
	}
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, status, map[string]any{"user": u, "map": snapshot})
}
