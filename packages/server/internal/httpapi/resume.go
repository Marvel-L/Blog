package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type resumePersistence interface {
	Resume(context.Context, string) (store.ResumeSnapshot, error)
	SaveResume(context.Context, string, int64, string, json.RawMessage) (store.ResumeSnapshot, bool, error)
}

func validResume(raw json.RawMessage) bool {
	var version struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(raw, &version) != nil {
		return false
	}
	if version.Version == 1 {
		return validResumeContent(raw)
	}
	body, err := fields(raw, "version", "documents")
	if err != nil || version.Version != 2 {
		return false
	}
	var documents []json.RawMessage
	if string(body["documents"]) == "null" || json.Unmarshal(body["documents"], &documents) != nil || len(documents) > 50 {
		return false
	}
	ids := map[string]bool{}
	total := 0
	for _, rawDocument := range documents {
		doc, err := fields(rawDocument, "id", "title", "content")
		if err != nil {
			doc, err = fields(rawDocument, "id", "title", "kind", "content")
		}
		var id, kind string
		if err != nil || json.Unmarshal(doc["id"], &id) != nil || !uuidPattern.MatchString(id) ||
			id != strings.ToLower(id) || ids[id] || !journalText(doc["title"], 120, false) ||
			!validResumeContent(doc["content"]) {
			return false
		}
		// Legacy categorized snapshots and backups remain readable; new drafts need no category.
		if doc["kind"] != nil &&
			(json.Unmarshal(doc["kind"], &kind) != nil || (kind != "resume" && kind != "interview" && kind != "notes")) {
			return false
		}
		var content struct {
			Markdown string `json:"markdown"`
		}
		if json.Unmarshal(doc["content"], &content) != nil {
			return false
		}
		total += utf8.RuneCountInString(content.Markdown)
		if total > 1000000 {
			return false
		}
		ids[id] = true
	}
	return true
}

func validResumeContent(raw json.RawMessage) bool {
	body, err := fields(raw, "version", "markdown")
	if err != nil {
		body, err = fields(raw, "version", "markdown", "comments")
	}
	if err != nil || string(body["version"]) != "1" || !journalText(body["markdown"], 100000, true) {
		return false
	}
	if body["comments"] == nil {
		return true
	}
	var comments []json.RawMessage
	if json.Unmarshal(body["comments"], &comments) != nil || len(comments) > 100 {
		return false
	}
	ids := map[string]bool{}
	for _, rawComment := range comments {
		comment, err := fields(rawComment, "id", "quote", "body", "createdAt")
		var id, createdAt string
		if err != nil || json.Unmarshal(comment["id"], &id) != nil || !uuidPattern.MatchString(id) ||
			id != strings.ToLower(id) || ids[id] || !journalText(comment["quote"], 1000, false) ||
			!journalText(comment["body"], 2000, false) || json.Unmarshal(comment["createdAt"], &createdAt) != nil {
			return false
		}
		stamp, err := time.Parse("2006-01-02T15:04:05.000Z", createdAt)
		if err != nil || stamp.Format("2006-01-02T15:04:05.000Z") != createdAt {
			return false
		}
		ids[id] = true
	}
	return true
}

func (a *API) resume(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	if r.URL.RawQuery != "" {
		failure(w, 400)
		return
	}
	db, ok := a.db.(resumePersistence)
	if !ok {
		failure(w, 503)
		return
	}
	var snapshot store.ResumeSnapshot
	status := 200
	if r.Method == "GET" {
		snapshot, err = db.Resume(r.Context(), u.ID)
	} else {
		raw, ok := jsonBody(w, r, 8*1024*1024)
		if !ok {
			return
		}
		body, parseErr := fields(raw, "expectedUserId", "baseRevision", "mutationId", "state")
		var base int64
		var mutation, expectedUser string
		if parseErr != nil || string(body["baseRevision"]) == "null" || json.Unmarshal(body["baseRevision"], &base) != nil ||
			base < 0 || base >= 9007199254740991 || json.Unmarshal(body["mutationId"], &mutation) != nil ||
			!uuidPattern.MatchString(mutation) || json.Unmarshal(body["expectedUserId"], &expectedUser) != nil ||
			!uuidPattern.MatchString(expectedUser) || !validResume(body["state"]) {
			failure(w, 400)
			return
		}
		// This is an account-switch guard, never an authorization source.
		if expectedUser != u.ID {
			failure(w, 401)
			return
		}
		var conflict bool
		snapshot, conflict, err = db.SaveResume(r.Context(), u.ID, base, strings.ToLower(mutation), body["state"])
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
	respond(w, status, map[string]any{"user": u, "resume": snapshot})
}
