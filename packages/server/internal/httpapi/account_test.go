package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const testAccountPassword = "test-password-strong"

func credentialBody(username, password string) string {
	b, _ := json.Marshal(map[string]string{"username": username, "password": password})
	return string(b)
}
func accountCookie(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-dblog_session" {
			return c.Name + "=" + c.Value
		}
	}
	t.Fatal("no account session cookie")
	return ""
}
func accountRegister(t *testing.T, f *fixture, username string) string {
	t.Helper()
	w := f.request("POST", "/api/v1/auth/account/register", "", credentialBody(username, testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	return accountCookie(t, w)
}
func accountIdentity(t *testing.T, f *fixture, cookie string) *store.User {
	t.Helper()
	var v struct {
		User *store.User `json:"user"`
	}
	w := f.request("GET", "/api/v1/me", cookie, "", "")
	requireStatus(t, w, 200)
	if json.Unmarshal(w.Body.Bytes(), &v) != nil || v.User == nil {
		t.Fatal("missing identity")
	}
	return v.User
}
func TestPasswordLoginAndUnboundGuards(t *testing.T) {
	f := setup(t)
	cookie := accountRegister(t, f, "new-account")
	u := accountIdentity(t, f, cookie)
	if u.GitHubBound || u.Username != "new-account" {
		t.Fatal("incorrect unbound identity")
	}
	var encoded string
	if err := f.db.Pool.QueryRow(ctx, "SELECT password_hash FROM account_credentials").Scan(&encoded); err != nil || strings.Contains(encoded, testAccountPassword) || !store.VerifyPassword(encoded, testAccountPassword) {
		t.Fatal("unsafe password storage")
	}
	for _, tc := range []struct{ method, path string }{
		{"GET", "/api/v1/planner/dashboard"}, {"PUT", "/api/v1/planner/dashboard"}, {"GET", "/api/v1/trend/dashboard"}, {"PUT", "/api/v1/trend/dashboard"}, {"GET", "/api/v1/anki/dashboard"}, {"POST", "/api/v1/anki/categories"}, {"PUT", "/api/v1/anki/ai/settings"},
	} {
		w := f.request(tc.method, tc.path, cookie, "{}", cfg.Origin)
		requireStatus(t, w, 403)
		if !strings.Contains(w.Body.String(), "github_binding_required") {
			t.Fatal("missing binding message")
		}
	}
	w := f.request("POST", "/api/v1/auth/account/login", cookie, credentialBody("NEW-ACCOUNT", testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	replacement := accountCookie(t, w)
	if replacement == cookie {
		t.Fatal("session not rotated")
	}
	if !strings.Contains(f.request("GET", "/api/v1/me", cookie, "", "").Body.String(), `"user":null`) {
		t.Fatal("old session survives")
	}
	if f.exchanges != 0 {
		t.Fatal("password login contacted github")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/account/login", "", credentialBody("new-account", "wrong-password"), cfg.Origin), 401)
}
func TestAccountRegistrationValidationAndOrigin(t *testing.T) {
	f := setup(t)
	body := credentialBody("new-account", testAccountPassword)
	requireStatus(t, f.request("POST", "/api/v1/auth/account/register", "", body, "https://evil.example"), 403)
	requireStatus(t, f.request("POST", "/api/v1/auth/account/register", "", body, ""), 403)
	accountRegister(t, f, "new-account")
	requireStatus(t, f.request("POST", "/api/v1/auth/account/register", "", body, cfg.Origin), 409)
	for _, b := range []string{`{"username":"aa","password":"test-password-strong"}`, `{"username":"valid","password":"short"}`, `{"username":"valid","password":"test-password-strong","user_id":"forged"}`, body + ` {}`, `null`} {
		requireStatus(t, f.request("POST", "/api/v1/auth/account/register", "", b, cfg.Origin), 400)
	}
}
func TestGitHubBindingPreservesExistingIdentity(t *testing.T) {
	f := setup(t)
	githubCookie := f.login(t, "")
	original := accountIdentity(t, f, githubCookie)
	category, err := f.db.CreateAnkiCategory(ctx, original.ID, "keep-data")
	if err != nil {
		t.Fatal(err)
	}
	local := accountRegister(t, f, "local-account")
	start := f.request("POST", "/api/v1/auth/github/bind", local, "", cfg.Origin)
	requireStatus(t, start, 200)
	var v struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(start.Body.Bytes(), &v) != nil {
		t.Fatal("bad binding response")
	}
	destination, _ := url.Parse(v.URL)
	state := destination.Query().Get("state")
	cookies := start.Result().Cookies()
	stateCookie := cookies[0].Name + "=" + cookies[0].Value
	callback := f.request("GET", "/api/v1/auth/github/callback?code=code&state="+state, local+"; "+stateCookie, "", "")
	requireStatus(t, callback, 302)
	bound := accountIdentity(t, f, accountCookie(t, callback))
	if bound.ID != original.ID || !bound.GitHubBound || bound.Username != "local-account" {
		t.Fatal("split identity")
	}
	if count(t, f.db, "users") != 1 || count(t, f.db, "anki_categories") != 1 {
		t.Fatal("data deleted or duplicate identity")
	}
	var owner string
	if err = f.db.Pool.QueryRow(ctx, "SELECT user_id::text FROM anki_categories WHERE id=$1", category.ID).Scan(&owner); err != nil || owner != original.ID {
		t.Fatal("business ownership changed")
	}
	login := f.request("POST", "/api/v1/auth/account/login", "", credentialBody("local-account", testAccountPassword), cfg.Origin)
	requireStatus(t, login, 200)
	if accountIdentity(t, f, accountCookie(t, login)).ID != original.ID {
		t.Fatal("password login has different data owner")
	}
	requireStatus(t, f.request("GET", "/api/v1/auth/github/callback?code=code&state="+state, local+"; "+stateCookie, "", ""), 400)
}
func TestGitHubToSystemAccountAndConflict(t *testing.T) {
	f := setup(t)
	githubCookie := f.login(t, "")
	id := accountIdentity(t, f, githubCookie).ID
	local := accountRegister(t, f, "existing-local")
	requireStatus(t, f.request("POST", "/api/v1/auth/account/bind", githubCookie, credentialBody("existing-local", "wrong-password"), cfg.Origin), 401)
	w := f.request("POST", "/api/v1/auth/account/bind", githubCookie, credentialBody("existing-local", testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	u := accountIdentity(t, f, accountCookie(t, w))
	if u.ID != id || u.Username != "existing-local" || !u.GitHubBound || count(t, f.db, "users") != 1 {
		t.Fatal("binding failed")
	}
	if !strings.Contains(f.request("GET", "/api/v1/me", local, "", "").Body.String(), `"user":null`) {
		t.Fatal("source session survived attachment")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/account/bind", accountCookie(t, w), credentialBody("another-name", testAccountPassword), cfg.Origin), 409)
}
func TestBindingCannotSurviveLogoutAndAccountSwitch(t *testing.T) {
	f := setup(t)
	cookie := accountRegister(t, f, "new-local")
	w := f.request("POST", "/api/v1/auth/github/bind", cookie, "", cfg.Origin)
	requireStatus(t, w, 200)
	var v struct {
		URL string `json:"url"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	u, _ := url.Parse(v.URL)
	state := u.Query().Get("state")
	c := w.Result().Cookies()[0]
	stateCookie := c.Name + "=" + c.Value
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, f.request("GET", "/api/v1/auth/github/callback?code=code&state="+state, cookie+"; "+stateCookie, "", ""), 401)
	if count(t, f.db, "account_credentials") != 1 || count(t, f.db, "users") != 1 {
		t.Fatal("invalid binding changed accounts")
	}
}
func TestGitHubCreatesNewSystemCredential(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	original := accountIdentity(t, f, cookie)
	w := f.request("POST", "/api/v1/auth/account/bind", cookie, credentialBody("fresh-system", testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	bound := accountIdentity(t, f, accountCookie(t, w))
	if bound.ID != original.ID || bound.Username != "fresh-system" {
		t.Fatal("new credential split identity")
	}
	login := f.request("POST", "/api/v1/auth/account/login", "", credentialBody("fresh-system", testAccountPassword), cfg.Origin)
	requireStatus(t, login, 200)
	if accountIdentity(t, f, accountCookie(t, login)).ID != original.ID {
		t.Fatal("new password cannot log in")
	}
}
func TestBindingDoesNotReplaceOtherBoundAccount(t *testing.T) {
	f := setup(t)
	githubCookie := f.login(t, "")
	w := f.request("POST", "/api/v1/auth/account/bind", githubCookie, credentialBody("claimed-name", testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	local := accountRegister(t, f, "second-account")
	start := f.request("POST", "/api/v1/auth/github/bind", local, "", cfg.Origin)
	requireStatus(t, start, 200)
	var v struct {
		URL string `json:"url"`
	}
	_ = json.Unmarshal(start.Body.Bytes(), &v)
	u, _ := url.Parse(v.URL)
	c := start.Result().Cookies()[0]
	requireStatus(t, f.request("GET", "/api/v1/auth/github/callback?code=code&state="+u.Query().Get("state"), local+"; "+c.Name+"="+c.Value, "", ""), 409)
	if count(t, f.db, "users") != 2 || count(t, f.db, "account_credentials") != 2 {
		t.Fatal("binding conflict altered existing accounts")
	}
}
func TestBindingFailsClosedOnUnexpectedUnboundData(t *testing.T) {
	f := setup(t)
	githubCookie := f.login(t, "")
	local := accountRegister(t, f, "unexpected-data")
	u := accountIdentity(t, f, local)
	if _, err := f.db.CreateAnkiCategory(ctx, u.ID, "unexpected"); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/account/bind", githubCookie, credentialBody("unexpected-data", testAccountPassword), cfg.Origin), 409)
	if count(t, f.db, "anki_categories") != 1 || count(t, f.db, "users") != 2 {
		t.Fatal("unexpected data lost")
	}
}
func TestNewGitHubCredentialAndInitialization(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	id := accountIdentity(t, f, cookie).ID
	hash, err := store.PasswordHash(testAccountPassword)
	if err != nil {
		t.Fatal(err)
	}
	if err = f.db.InitializeAccount(ctx, "initial-account", hash, f.identity.ID); err != nil {
		t.Fatal(err)
	}
	w := f.request("POST", "/api/v1/auth/account/login", "", credentialBody("initial-account", testAccountPassword), cfg.Origin)
	requireStatus(t, w, 200)
	if accountIdentity(t, f, accountCookie(t, w)).ID != id {
		t.Fatal("seed changed owner")
	}
	if f.db.InitializeAccount(ctx, "initial-account", hash, f.identity.ID) == nil {
		t.Fatal("seed overwrote credential")
	}
}
