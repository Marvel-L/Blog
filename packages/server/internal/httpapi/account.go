package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func accountFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrCredentials):
		respond(w, 401, map[string]string{"error": "账号或密码错误，或尝试过于频繁，请稍后重试"})
	case errors.Is(err, store.ErrAccountConflict):
		respond(w, 409, map[string]string{"error": "账号已存在或已绑定，不能重复绑定或替换"})
	case errors.Is(err, store.ErrUnboundData):
		respond(w, 409, map[string]string{"error": "账号存在异常数据，已停止绑定以保护原数据，请联系管理员"})
	default:
		failure(w, 503)
	}
}
func accountBody(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	raw, ok := jsonBody(w, r, 2048)
	if !ok {
		return "", "", false
	}
	m, err := fields(raw, "username", "password")
	var username, password string
	if err != nil || json.Unmarshal(m["username"], &username) != nil || json.Unmarshal(m["password"], &password) != nil || !store.ValidUsername(username) || !store.ValidPassword(password) {
		respond(w, 400, map[string]string{"error": "账号需为 3–32 位字母、数字、下划线或短横线，密码需为 8–128 位"})
		return "", "", false
	}
	return username, password, true
}
func (a *API) accountSession(w http.ResponseWriter, r *http.Request, token string) {
	user, err := a.db.FindUser(r.Context(), token)
	if err != nil || user == nil {
		failure(w, 503)
		return
	}
	a.cookie(w, a.sessionCookie, token, 7*24*3600)
	respond(w, 200, map[string]any{"user": user})
}
func (a *API) registerAccount(w http.ResponseWriter, r *http.Request) {
	username, password, ok := accountBody(w, r)
	if !ok {
		return
	}
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u != nil {
		respond(w, 409, map[string]string{"error": "已登录，请在当前账号中绑定系统账号"})
		return
	}
	token, err := a.db.RegisterAccount(r.Context(), username, password, cookieValue(r, a.sessionCookie))
	if err != nil {
		accountFailure(w, err)
		return
	}
	a.accountSession(w, r, token)
}
func (a *API) loginAccount(w http.ResponseWriter, r *http.Request) {
	username, password, ok := accountBody(w, r)
	if !ok {
		return
	}
	token, err := a.db.LoginAccount(r.Context(), username, password, cookieValue(r, a.sessionCookie))
	if err != nil {
		accountFailure(w, err)
		return
	}
	a.accountSession(w, r, token)
}
func (a *API) bindAccount(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	if !u.GitHubBound {
		respond(w, 403, map[string]string{"error": "请先绑定 GitHub"})
		return
	}
	username, password, ok := accountBody(w, r)
	if !ok {
		return
	}
	token, err := a.db.BindAccount(r.Context(), cookieValue(r, a.sessionCookie), username, password)
	if err != nil {
		accountFailure(w, err)
		return
	}
	a.accountSession(w, r, token)
}
func requireGitHub(w http.ResponseWriter, u *store.User) bool {
	if u == nil {
		failure(w, 401)
		return false
	}
	if !u.GitHubBound {
		respond(w, 403, map[string]string{"error": "请先在云端账号中绑定 GitHub，再使用 Planner、Anki、Trend", "code": "github_binding_required"})
		return false
	}
	return true
}
