package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const ankiHistoryDays = 91 // 近 7 日折线 + 近 13 周热力共用同一份统计窗口。

func ankiName(raw json.RawMessage) (string, bool) {
	s, ok := text(raw)
	trimmed := strings.TrimSpace(s)
	return trimmed, ok && utf8.RuneCountInString(trimmed) >= 1 && utf8.RuneCountInString(trimmed) <= 100
}

func ankiText(raw json.RawMessage) (string, bool) {
	s, ok := text(raw)
	return s, ok && strings.TrimSpace(s) != "" && utf8.RuneCountInString(s) <= 10000
}

func ankiInt(raw json.RawMessage, min, max int) (int, bool) {
	v, ok := number(raw)
	if !ok || v < float64(min) || v > float64(max) || v != float64(int(v)) {
		return 0, false
	}
	return int(v), true
}

// ankiUser 仅接受服务端会话 Cookie；不接受客户端 user_id。
func (a *API) ankiUser(w http.ResponseWriter, r *http.Request) (*store.User, bool) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return nil, false
	}
	if u == nil {
		failure(w, 401)
		return nil, false
	}
	return u, true
}

func ankiError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, store.ErrAnkiNotFound):
		failure(w, 404)
	case errors.Is(err, store.ErrAnkiVersion):
		failure(w, 409)
	case errors.Is(err, store.ErrAnkiNotDue):
		failure(w, 409)
	case errors.Is(err, store.ErrMutationReuse):
		failure(w, 400)
	case errors.Is(err, store.ErrAnkiDuplicateName):
		respond(w, 409, map[string]string{"error": "分类名称已存在"})
	default:
		failure(w, 503)
	}
	return true
}

func (a *API) ankiDashboard(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	v, err := a.db.AnkiDashboard(r.Context(), u.ID, ankiHistoryDays)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, v)
}

func (a *API) ankiCreateCategory(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	m, err := fields(raw, "name")
	name, valid := ankiName(m["name"])
	if err != nil || !valid {
		failure(w, 400)
		return
	}
	c, err := a.db.CreateAnkiCategory(r.Context(), u.ID, name)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, c)
}

func (a *API) ankiCreateDeck(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	m, err := fields(raw, "categoryId", "name")
	categoryID, _ := text(m["categoryId"])
	name, validName := ankiName(m["name"])
	if err != nil || !uuidPattern.MatchString(categoryID) || !validName {
		failure(w, 400)
		return
	}
	d, err := a.db.CreateAnkiDeck(r.Context(), u.ID, categoryID, name)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, d)
}

func (a *API) ankiDeckCards(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	deckID := r.PathValue("deckId")
	if !uuidPattern.MatchString(deckID) {
		failure(w, 400)
		return
	}
	cards, err := a.db.ListAnkiCards(r.Context(), u.ID, deckID)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, map[string]any{"cards": cards})
}

func (a *API) ankiCreateCard(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	deckID := r.PathValue("deckId")
	if !uuidPattern.MatchString(deckID) {
		failure(w, 400)
		return
	}
	raw, ok := jsonBody(w, r, 64*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "question", "answer")
	question, qok := ankiText(m["question"])
	answer, aok := ankiText(m["answer"])
	if err != nil || !qok || !aok {
		failure(w, 400)
		return
	}
	c, err := a.db.CreateAnkiCard(r.Context(), u.ID, deckID, question, answer)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, c)
}

func (a *API) ankiPatchCard(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	cardID := r.PathValue("cardId")
	if !uuidPattern.MatchString(cardID) {
		failure(w, 400)
		return
	}
	raw, ok := jsonBody(w, r, 64*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "question", "answer", "resetProgress", "version")
	question, qok := ankiText(m["question"])
	answer, aok := ankiText(m["answer"])
	version, vok := ankiInt(m["version"], 1, 9007199254740990)
	if err != nil || !qok || !aok || !boolean(m["resetProgress"]) || !vok {
		failure(w, 400)
		return
	}
	c, err := a.db.UpdateAnkiCard(r.Context(), u.ID, cardID, question, answer, string(m["resetProgress"]) == "true", version)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, c)
}

func (a *API) ankiQueue(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	deckID := r.PathValue("deckId")
	if !uuidPattern.MatchString(deckID) {
		failure(w, 400)
		return
	}
	cards, serverNow, err := a.db.AnkiQueue(r.Context(), u.ID, deckID)
	if ankiError(w, err) {
		return
	}
	previews := map[string]any{}
	for _, c := range cards {
		days := store.Previews(c.IntervalDays, c.Repetitions, c.EaseFactor)
		previews[c.ID] = map[string]any{"againMinutes": 10, "nextDays": days}
	}
	respond(w, 200, map[string]any{"cards": cards, "serverNow": serverNow.UTC().Format(time.RFC3339Nano), "previews": previews})
}

func (a *API) ankiReview(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	// cardId/version/mutationId 必选；rating 与 customDays 二选一（自定义独立分支，不与三档互评）。
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		failure(w, 400)
		return
	}
	for k := range m {
		switch k {
		case "cardId", "version", "mutationId", "rating", "customDays":
		default:
			failure(w, 400)
			return
		}
	}
	cardID, _ := text(m["cardId"])
	version, vok := ankiInt(m["version"], 1, 9007199254740990)
	mutationID, _ := text(m["mutationId"])
	if m["cardId"] == nil || m["version"] == nil || m["mutationId"] == nil ||
		!uuidPattern.MatchString(cardID) || !vok || !uuidPattern.MatchString(mutationID) {
		failure(w, 400)
		return
	}
	// 可选字段：区分“缺失”与“提供”。
	var body struct {
		Rating     *string `json:"rating"`
		CustomDays *int    `json:"customDays"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		failure(w, 400)
		return
	}
	var rating string
	var customDays *int
	if body.Rating != nil && body.CustomDays != nil {
		failure(w, 400) // 互斥：不能同时提交三档评价与自定义天数。
		return
	}
	if body.CustomDays != nil {
		d := *body.CustomDays
		if d < 1 || d > 365 {
			failure(w, 400)
			return
		}
		customDays = &d
	} else if body.Rating != nil {
		rt := *body.Rating
		if rt != "wrong" && rt != "hard" && rt != "correct" {
			failure(w, 400)
			return
		}
		rating = rt
	} else {
		failure(w, 400) // 至少要有一个评价依据。
		return
	}
	c, err := a.db.ReviewAnkiCard(r.Context(), u.ID, cardID, version, strings.ToLower(mutationID), rating, customDays)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, map[string]any{"card": c})
}

func (a *API) ankiSetGoal(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	raw, ok := jsonBody(w, r, 1024)
	if !ok {
		return
	}
	m, err := fields(raw, "goal")
	goal, vok := ankiInt(m["goal"], 1, 500)
	if err != nil || !vok {
		failure(w, 400)
		return
	}
	g, err := a.db.SetAnkiGoal(r.Context(), u.ID, goal)
	if ankiError(w, err) {
		return
	}
	respond(w, 200, map[string]any{"goal": g})
}
