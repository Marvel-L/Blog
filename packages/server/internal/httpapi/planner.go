package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func (a *API) plannerUser(r *http.Request) (*store.User, error) { return a.trendUser(r) }
func (a *API) getPlanner(w http.ResponseWriter, r *http.Request) {
	u, err := a.plannerUser(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	v, err := a.db.Planner(r.Context(), u.ID)
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]any{"user": u, "planner": v})
}
func (a *API) putPlanner(w http.ResponseWriter, r *http.Request) {
	u, err := a.plannerUser(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	raw, ok := jsonBody(w, r, 3*1024*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "baseRevision", "mutationId", "state")
	var base int64
	var mutation string
	markdown, valid := plannerMarkdown(m["state"])
	if err != nil || json.Unmarshal(m["baseRevision"], &base) != nil || base < 0 || base >= 9007199254740991 || json.Unmarshal(m["mutationId"], &mutation) != nil || !uuidPattern.MatchString(mutation) || !valid {
		failure(w, 400)
		return
	}
	v, conflict, err := a.db.SavePlanner(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"], markdown, a.config.PlannerGitHubEnabled())
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
