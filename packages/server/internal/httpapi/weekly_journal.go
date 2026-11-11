package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type weeklyJournalPersistence interface {
	WeeklyJournal(context.Context, string, string) (store.WeeklyJournalSnapshot, error)
	SaveWeeklyJournal(context.Context, string, string, int64, string, json.RawMessage) (store.WeeklyJournalSnapshot, bool, error)
}

func journalDate(value string) (time.Time, bool) {
	d, err := time.Parse("2006-01-02", value)
	return d, err == nil && d.Format("2006-01-02") == value && d.Year() >= 1900 && d.Year() <= 2100
}

func journalMonday(day time.Time) time.Time {
	return day.AddDate(0, 0, -(int(day.Weekday())+6)%7)
}

func journalText(raw json.RawMessage, max int, empty bool) bool {
	var text string
	if string(raw) == "null" || json.Unmarshal(raw, &text) != nil || len([]rune(text)) > max || (!empty && strings.TrimSpace(text) == "") {
		return false
	}
	for _, r := range text {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return false
		}
	}
	return true
}

func validWeeklyJournal(raw json.RawMessage, monday time.Time) bool {
	top, err := fields(raw, "version", "days")
	var days []json.RawMessage
	if err != nil || string(top["version"]) != "1" || json.Unmarshal(top["days"], &days) != nil || len(days) != 7 {
		return false
	}
	ids := map[string]bool{}
	for index, rawDay := range days {
		day, err := fields(rawDay, "date", "content", "thoughts")
		var date string
		var thoughts []json.RawMessage
		if err != nil || json.Unmarshal(day["date"], &date) != nil || date != monday.AddDate(0, 0, index).Format("2006-01-02") ||
			!journalText(day["content"], 20000, true) || string(day["thoughts"]) == "null" || json.Unmarshal(day["thoughts"], &thoughts) != nil || len(thoughts) > 100 {
			return false
		}
		for _, rawThought := range thoughts {
			thought, err := fields(rawThought, "id", "content", "createdAt")
			var id, createdAt string
			if err != nil || json.Unmarshal(thought["id"], &id) != nil || !uuidPattern.MatchString(id) || ids[strings.ToLower(id)] ||
				!journalText(thought["content"], 5000, false) || json.Unmarshal(thought["createdAt"], &createdAt) != nil {
				return false
			}
			stamp, err := time.Parse(time.RFC3339Nano, createdAt)
			if err != nil || stamp.Year() < 1900 || stamp.Year() > 2100 {
				return false
			}
			ids[strings.ToLower(id)] = true
		}
	}
	return true
}

func (a *API) weeklyJournal(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	db, ok := a.db.(weeklyJournalPersistence)
	if !ok {
		failure(w, 503)
		return
	}
	// Same natural-day boundary as Anki's activity log.
	today := time.Now().In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query) > 1 || len(query["week"]) > 1 || (len(query) == 1 && query["week"] == nil) {
		failure(w, 400)
		return
	}
	value := query.Get("week")
	if value == "" {
		if r.Method != "GET" || len(query) != 0 {
			failure(w, 400)
			return
		}
		value = today
	}
	day, ok := journalDate(value)
	if !ok {
		failure(w, 400)
		return
	}
	monday := journalMonday(day)
	week := monday.Format("2006-01-02")
	var snapshot store.WeeklyJournalSnapshot
	status := 200
	if r.Method == "GET" {
		snapshot, err = db.WeeklyJournal(r.Context(), u.ID, week)
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
			!uuidPattern.MatchString(mutation) || !validWeeklyJournal(body["state"], monday) {
			failure(w, 400)
			return
		}
		var conflict bool
		snapshot, conflict, err = db.SaveWeeklyJournal(r.Context(), u.ID, week, base, strings.ToLower(mutation), body["state"])
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
	respond(w, status, map[string]any{"user": u, "weekStart": week, "today": today, "timeZone": "Asia/Shanghai", "archive": snapshot})
}
