package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func (a *API) ankiActivity(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	query := r.URL.Query()
	date := query.Get("date")
	day, err := time.Parse("2006-01-02", date)
	if err != nil || day.Year() < 1 || day.Format("2006-01-02") != date || len(query["date"]) != 1 {
		failure(w, 400)
		return
	}
	var cursor int64
	if raw, present := query["cursor"]; present {
		if len(raw) != 1 {
			failure(w, 400)
			return
		}
		cursor, err = strconv.ParseInt(raw[0], 10, 64)
		if err != nil || cursor <= 0 {
			failure(w, 400)
			return
		}
	}
	page, err := a.db.AnkiActivities(r.Context(), u.ID, date, cursor)
	if errors.Is(err, store.ErrAnkiActivityRange) {
		failure(w, 400)
		return
	}
	if ankiError(w, err) {
		return
	}
	respond(w, 200, page)
}
