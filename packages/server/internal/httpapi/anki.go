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
	var s string
	err := json.Unmarshal(raw, &s)
	return s, err == nil && strings.TrimSpace(s) != "" && utf8.RuneCountInString(s) <= 10000
}

// ankiTags 严格区分省略（PATCH 保留）、空数组（清空）与非法值。
func ankiTags(raw json.RawMessage) ([]string, bool) {
	if raw == nil {
		return nil, true
	}
	var values []json.RawMessage
	if string(raw) == "null" || json.Unmarshal(raw, &values) != nil || len(values) > 20 {
		return nil, false
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		var name string
		if json.Unmarshal(value, &name) != nil || string(value) == "null" {
			return nil, false
		}
		name = strings.TrimSpace(name)
		if name == "" || utf8.RuneCountInString(name) > 30 || strings.ContainsAny(name, ",，\n\r\t") {
			return nil, false
		}
		key := strings.ToLower(name)
		if !seen[key] {
			tags = append(tags, name)
			seen[key] = true
		}
	}
	return tags, true
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
	case errors.Is(err, store.ErrAnkiUnknownTag):
		respond(w, 400, map[string]string{"error": "标签不属于当前卡片库或已被删除，请刷新后重新选择"})
	case errors.Is(err, store.ErrAnkiDuplicateTag):
		respond(w, 409, map[string]string{"error": "标签已存在（忽略大小写）"})
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
	var supplied map[string]json.RawMessage
	if json.Unmarshal(raw, &supplied) != nil {
		failure(w, 400)
		return
	}
	keys := []string{"question", "answer"}
	if supplied["tags"] != nil {
		keys = append(keys, "tags")
	}
	m, err := fields(raw, keys...)
	question, qok := ankiText(m["question"])
	answer, aok := ankiText(m["answer"])
	tags, tok := ankiTags(m["tags"])
	if err != nil || !qok || !aok || !tok {
		failure(w, 400)
		return
	}
	c, err := a.db.CreateAnkiCard(r.Context(), u.ID, deckID, question, answer, tags)
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
	var supplied map[string]json.RawMessage
	if json.Unmarshal(raw, &supplied) != nil {
		failure(w, 400)
		return
	}
	keys := []string{"question", "answer", "resetProgress", "version"}
	if supplied["tags"] != nil {
		keys = append(keys, "tags")
	}
	deckID := ""
	if supplied["deckId"] != nil {
		keys = append(keys, "deckId")
		deckID, _ = text(supplied["deckId"])
		if !uuidPattern.MatchString(deckID) {
			failure(w, 400)
			return
		}
	}
	m, err := fields(raw, keys...)
	question, qok := ankiText(m["question"])
	answer, aok := ankiText(m["answer"])
	version, vok := ankiInt(m["version"], 1, 9007199254740990)
	tags, tok := ankiTags(m["tags"])
	if err != nil || !qok || !aok || !tok || !boolean(m["resetProgress"]) || !vok {
		failure(w, 400)
		return
	}
	c, err := a.db.UpdateAnkiCard(r.Context(), u.ID, cardID, deckID, question, answer, string(m["resetProgress"]) == "true", version, tags)
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

func (a *API) ankiPractice(w http.ResponseWriter, r *http.Request) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return
	}
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	m, err := fields(raw, "cardId", "version", "mutationId", "rating")
	cardID, _ := text(m["cardId"])
	mutationID, _ := text(m["mutationId"])
	version, valid := ankiInt(m["version"], 1, 9007199254740990)
	rating, _ := text(m["rating"])
	if err != nil || !valid || !uuidPattern.MatchString(cardID) || !uuidPattern.MatchString(mutationID) || (rating != "correct" && rating != "hard" && rating != "wrong") {
		failure(w, 400)
		return
	}
	c, err := a.db.PracticeAnkiCard(r.Context(), u.ID, cardID, version, strings.ToLower(mutationID), rating)
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
