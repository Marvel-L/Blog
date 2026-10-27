package httpapi

import (
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"net/http"
)

func (a *API) ankiTagTarget(w http.ResponseWriter, r *http.Request, withTag bool) (*store.User, string, string, bool) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return nil, "", "", false
	}
	deckID, tagID := r.PathValue("deckId"), r.PathValue("tagId")
	if !uuidPattern.MatchString(deckID) || (withTag && !uuidPattern.MatchString(tagID)) {
		failure(w, 400)
		return nil, "", "", false
	}
	return u, deckID, tagID, true
}
func ankiTagName(w http.ResponseWriter, r *http.Request) (string, bool) {
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return "", false
	}
	m, err := fields(raw, "name")
	names, valid := ankiTags(append(append([]byte{'['}, m["name"]...), ']'))
	if err != nil || !valid || len(names) != 1 {
		failure(w, 400)
		return "", false
	}
	return names[0], true
}
func (a *API) ankiTagList(w http.ResponseWriter, r *http.Request) {
	u, deck, _, ok := a.ankiTagTarget(w, r, false)
	if !ok {
		return
	}
	tags, err := a.db.ListAnkiTags(r.Context(), u.ID, deck)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, map[string]any{"tags": tags})
}
func (a *API) ankiTagCreate(w http.ResponseWriter, r *http.Request) {
	u, deck, _, ok := a.ankiTagTarget(w, r, false)
	if !ok {
		return
	}
	name, ok := ankiTagName(w, r)
	if !ok {
		return
	}
	tag, err := a.db.CreateAnkiTag(r.Context(), u.ID, deck, name)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, tag)
}
func (a *API) ankiTagRename(w http.ResponseWriter, r *http.Request) {
	u, deck, id, ok := a.ankiTagTarget(w, r, true)
	if !ok {
		return
	}
	name, ok := ankiTagName(w, r)
	if !ok {
		return
	}
	tag, err := a.db.RenameAnkiTag(r.Context(), u.ID, deck, id, name)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, tag)
}
func (a *API) ankiTagDelete(w http.ResponseWriter, r *http.Request) {
	u, deck, id, ok := a.ankiTagTarget(w, r, true)
	if !ok {
		return
	}
	if ankiError(w, a.db.DeleteAnkiTag(r.Context(), u.ID, deck, id)) {
		return
	}
	respond(w, 200, map[string]bool{"deleted": true})
}
