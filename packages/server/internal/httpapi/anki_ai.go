package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

// Optional interface preserves the existing API fixture contract. Production Store implements it.
type aiPersistence interface {
	AISettings(context.Context, string) (store.AISettings, error)
	SetAIKey(context.Context, string, string, string, *deepseek.Cipher) (store.AISettings, error)
	DeleteAIKey(context.Context, string) error
	CreateAICheck(context.Context, string, string, int, string, string) (store.AICheck, error)
	ListAIChecks(context.Context, string, string, int, string) (store.AICheckList, error)
	GetAICheck(context.Context, string, string) (store.AICheck, error)
	DeleteAICheck(context.Context, string, string) error
}

func aiFailure(w http.ResponseWriter, status int, code, message string) {
	respond(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "retryable": false}})
}
func aiError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch {
	case errors.Is(err, store.ErrAnkiNotFound):
		aiFailure(w, 404, "NOT_FOUND", "卡片或记录不存在")
	case errors.Is(err, store.ErrAnkiVersion):
		aiFailure(w, 409, "CARD_VERSION_CONFLICT", "卡片已更新，请刷新后重新检查")
	case errors.Is(err, store.ErrMutationReuse):
		aiFailure(w, 409, "MUTATION_REUSED", "请求标识已被用于不同的检查")
	case errors.Is(err, store.ErrAINotConfigured):
		aiFailure(w, 400, "AI_NOT_CONFIGURED", "请先配置自己的 DeepSeek API Key")
	case errors.Is(err, store.ErrAIActive):
		aiFailure(w, 409, "AI_CHECK_RUNNING", "当前卡片已有检查进行中，请查看历史中的任务状态")
	case errors.Is(err, store.ErrAIRateLimited):
		aiFailure(w, 429, "AI_RATE_LIMITED", "检查过于频繁，请稍后再试")
	case errors.Is(err, store.ErrAIDeleted):
		aiFailure(w, 410, "AI_CHECK_DELETED", "该次检查已删除，不会重复创建")
	case errors.Is(err, store.ErrAICursor):
		aiFailure(w, 400, "AI_CURSOR_INVALID", "分页参数无效")
	default:
		aiFailure(w, 503, "AI_UNAVAILABLE", "AI 服务暂时不可用，请检查服务配置或稍后重试")
	}
	return true
}
func (a *API) aiStore(w http.ResponseWriter, r *http.Request) (aiPersistence, *store.User, bool) {
	u, ok := a.ankiUser(w, r)
	if !ok {
		return nil, nil, false
	}
	db, ok := a.db.(aiPersistence)
	if !ok {
		aiFailure(w, 503, "AI_UNAVAILABLE", "AI 服务尚不可用")
		return nil, nil, false
	}
	return db, u, true
}
func (a *API) ankiAISettings(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	settings, err := db.AISettings(r.Context(), u.ID)
	if aiError(w, err) {
		return
	}
	settings.Available = a.aiCipher != nil
	respond(w, 200, settings)
}
func (a *API) ankiAISetKey(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	if a.aiCipher == nil {
		aiError(w, store.ErrAIUnavailable)
		return
	}
	raw, ok := jsonBody(w, r, 2048)
	if !ok {
		return
	}
	fields, err := deepseek.StrictObject(raw, "apiKey")
	var key string
	if err != nil || len(fields) != 1 || json.Unmarshal(fields["apiKey"], &key) != nil || !deepseek.ValidKey(key) {
		aiFailure(w, 400, "AI_KEY_FORMAT_INVALID", "API Key 格式无效，请检查输入")
		return
	}
	settings, err := db.SetAIKey(r.Context(), u.ID, key, a.config.AIEncryptionKeyID, a.aiCipher)
	if aiError(w, err) {
		return
	}
	respond(w, 200, settings)
}
func (a *API) ankiAIDeleteKey(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	if aiError(w, db.DeleteAIKey(r.Context(), u.ID)) {
		return
	}
	w.WriteHeader(204)
}
func (a *API) ankiAICreate(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	if a.aiCipher == nil {
		aiError(w, store.ErrAIUnavailable)
		return
	}
	id := r.PathValue("cardId")
	if !uuidPattern.MatchString(id) {
		aiFailure(w, 400, "REQUEST_INVALID", "卡片标识无效")
		return
	}
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	fields, err := deepseek.StrictObject(raw, "version", "mutationId")
	version, vok := ankiInt(fields["version"], 1, 9007199254740990)
	var mutation string
	if err != nil || len(fields) != 2 || !vok || json.Unmarshal(fields["mutationId"], &mutation) != nil || !uuidPattern.MatchString(mutation) {
		aiFailure(w, 400, "REQUEST_INVALID", "检查请求无效")
		return
	}
	c, err := db.CreateAICheck(r.Context(), u.ID, strings.ToLower(id), version, strings.ToLower(mutation), a.config.AIModel)
	if aiError(w, err) {
		return
	}
	respond(w, 202, map[string]any{"check": c})
}
func (a *API) ankiAIList(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	id := r.PathValue("cardId")
	if !uuidPattern.MatchString(id) {
		aiFailure(w, 400, "REQUEST_INVALID", "卡片标识无效")
		return
	}
	q := r.URL.Query()
	if len(q["limit"]) > 1 || len(q["cursor"]) > 1 || len(q.Get("cursor")) > 200 {
		aiError(w, store.ErrAICursor)
		return
	}
	limit, err := store.AIPageLimit(q.Get("limit"))
	if aiError(w, err) {
		return
	}
	list, err := db.ListAIChecks(r.Context(), u.ID, id, limit, q.Get("cursor"))
	if aiError(w, err) {
		return
	}
	respond(w, 200, list)
}
func (a *API) ankiAIGet(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	id := r.PathValue("checkId")
	if !uuidPattern.MatchString(id) {
		aiFailure(w, 400, "REQUEST_INVALID", "记录标识无效")
		return
	}
	c, err := db.GetAICheck(r.Context(), u.ID, id)
	if aiError(w, err) {
		return
	}
	respond(w, 200, map[string]any{"check": c})
}
func (a *API) ankiAIDelete(w http.ResponseWriter, r *http.Request) {
	db, u, ok := a.aiStore(w, r)
	if !ok {
		return
	}
	id := r.PathValue("checkId")
	if !uuidPattern.MatchString(id) {
		aiFailure(w, 400, "REQUEST_INVALID", "记录标识无效")
		return
	}
	if aiError(w, db.DeleteAICheck(r.Context(), u.ID, id)) {
		return
	}
	w.WriteHeader(204)
}
