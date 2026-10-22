package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

const trendState = `{"version":1,"categories":[{"id":"a","name":"零食","kind":"custom","xMetric":"x","yMetric":"y","xLabel":"","yLabel":"","threshold":{"enabled":true,"axis":"y","direction":"above","value":100},"onDashboard":true,"items":[{"id":"b","name":"鸭腿","price":5,"weight":130,"energy":600,"energyUnit":"kJ","x":5,"y":600}]}],"selectedId":"a"}`
const pagesOrigin = "https://marvel-l.github.io"

func trendSetup(t *testing.T) *fixture {
	f := setup(t)
	c := cfg
	c.TrendAllowedOrigins = []string{pagesOrigin, "http://localhost:3000"}
	f.handler = New(c, f.db, func(_ctx context.Context, _, _ string) (github.Identity, error) { return f.identity, nil })
	return f
}
func mutation(base int, id, state string) string {
	return fmt.Sprintf(`{"baseRevision":%d,"mutationId":%q,"state":%s}`, base, id, state)
}
func grantRequest(f *fixture, method, path, token, body, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:55"
	r.Header.Set("Origin", origin)
	r.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}
func connectPath() (string, string) {
	verifier := store.Secret()
	sum := sha256.Sum256([]byte(verifier))
	return "/api/v1/trend/connect?" + url.Values{
		"origin": {pagesOrigin}, "state": {store.Secret()}, "challenge": {base64.RawURLEncoding.EncodeToString(sum[:])},
	}.Encode(), verifier
}
func trendGrant(t *testing.T, f *fixture, cookie string) string {
	t.Helper()
	path, verifier := connectPath()
	w := f.request("GET", path, cookie, "", "")
	requireStatus(t, w, 200)
	code := regexp.MustCompile(`"code":"([A-Za-z0-9_-]{43})"`).FindStringSubmatch(w.Body.String())
	if len(code) != 2 {
		t.Fatal("missing popup code")
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") || !strings.Contains(w.Body.String(), pagesOrigin) {
		t.Fatal("unsafe popup")
	}
	body := fmt.Sprintf(`{"code":%q,"verifier":%q}`, code[1], verifier)
	requireStatus(t, f.request("POST", "/api/v1/trend/exchange", "", fmt.Sprintf(`{"code":%q,"verifier":%q}`, code[1], store.Secret()), pagesOrigin), 401)
	w = f.request("POST", "/api/v1/trend/exchange", "", body, pagesOrigin)
	requireStatus(t, w, 200)
	var result struct{ Token string }
	if json.Unmarshal(w.Body.Bytes(), &result) != nil || !tokenPattern.MatchString(result.Token) {
		t.Fatal("invalid grant")
	}
	requireStatus(t, f.request("POST", "/api/v1/trend/exchange", "", body, pagesOrigin), 401)
	var hash string
	if err := f.db.Pool.QueryRow(ctx, "SELECT token_hash FROM trend_sessions WHERE token_hash=$1", store.Hash(result.Token)).Scan(&hash); err != nil || hash == result.Token {
		t.Fatal("grant not stored as digest")
	}
	return result.Token
}

func TestTrendCASRetryIsolationAndFaults(t *testing.T) {
	f := trendSetup(t)
	alice := f.login(t, "")
	path := "/api/v1/trend/dashboard"
	requireStatus(t, f.request("GET", path, "", "", ""), 401)
	w := f.request("GET", path, alice, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":0`) || !strings.Contains(w.Body.String(), `"state":null`) {
		t.Fatal("missing empty snapshot")
	}
	payload := mutation(0, "315fc762-613d-4b27-bef1-900686b00001", trendState)
	requireStatus(t, f.request("PUT", path, alice, payload, cfg.Origin), 200)
	w = f.request("PUT", path, alice, payload, cfg.Origin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"revision":1`) {
		t.Fatal("retry incremented revision")
	}
	requireStatus(t, f.request("PUT", path, alice, strings.Replace(payload, "零食", "咖啡", 1), cfg.Origin), 400)
	w = f.request("PUT", path, alice, mutation(0, "315fc762-613d-4b27-bef1-900686b00002", trendState), cfg.Origin)
	requireStatus(t, w, 409)
	if !strings.Contains(w.Body.String(), `"revision":1`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing conflict snapshot")
	}
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	w = f.request("GET", path, bob, "", "")
	if strings.Contains(w.Body.String(), "鸭腿") {
		t.Fatal("state crossed accounts")
	}
	requireStatus(t, f.request("PUT", path, bob, payload, cfg.Origin), 200)
	if count(t, f.db, "trend_dashboards") != 2 {
		t.Fatal("missing account isolation")
	}
	exec(t, f.db, "ALTER TABLE trend_dashboards RENAME TO unavailable_trend")
	w = f.request("GET", path, alice, "", "")
	requireStatus(t, w, 503)
	if strings.Contains(w.Body.String(), "unavailable") {
		t.Fatal("SQL fault leaked")
	}
	requireStatus(t, f.request("PUT", path, alice, payload, cfg.Origin), 503)
}

func TestTrendConcurrentFirstWrite(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	u, err := f.db.FindUser(ctx, strings.SplitN(cookie, "=", 2)[1])
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan bool, 4)
	for i := range 4 {
		wg.Go(func() {
			_, conflict, err := f.db.SaveTrend(ctx, u.ID, 0, fmt.Sprintf("315fc762-613d-4b27-bef1-%012d", i), json.RawMessage(trendState))
			if err != nil {
				t.Error(err)
			}
			results <- conflict
		})
	}
	wg.Wait()
	close(results)
	conflicts := 0
	for conflict := range results {
		if conflict {
			conflicts++
		}
	}
	if conflicts != 3 || count(t, f.db, "trend_dashboards") != 1 {
		t.Fatal("first write race was not serialized")
	}
}

func TestTrendPopupAndScopedGrant(t *testing.T) {
	f := trendSetup(t)
	path, _ := connectPath()
	w := f.request("GET", path, "", "", "")
	requireStatus(t, w, 302)
	start, _ := url.Parse(w.Header().Get("Location"))
	if start.Query().Get("return_to") != path {
		t.Fatal("lost popup return path")
	}
	w = f.request("GET", start.String(), "", "", "")
	requireStatus(t, w, 302)
	provider, _ := url.Parse(w.Header().Get("Location"))
	stateCookie := w.Result().Cookies()[0]
	w = f.request("GET", "/api/v1/auth/github/callback?code=c&state="+provider.Query().Get("state"), stateCookie.Name+"="+stateCookie.Value, "", "")
	requireStatus(t, w, 302)
	if w.Header().Get("Location") != path {
		t.Fatal("OAuth did not return to popup")
	}
	cookie := f.login(t, "")
	token := trendGrant(t, f, cookie)
	requireStatus(t, grantRequest(f, "GET", "/api/v1/trend/dashboard", token, "", pagesOrigin), 200)
	requireStatus(t, grantRequest(f, "PUT", "/api/v1/trend/dashboard", token, mutation(0, "315fc762-613d-4b27-bef1-900686b00001", trendState), pagesOrigin), 200)
	requireStatus(t, grantRequest(f, "GET", "/api/v1/trend/dashboard", token, "", "http://localhost:3000"), 401)
	requireStatus(t, f.request("GET", "/api/v1/trend/dashboard", cookie, "", pagesOrigin), 401)
	w = grantRequest(f, "GET", "/api/v1/me", token, "", pagesOrigin)
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"user":null`) || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("Trend token authenticated account routes")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", cookie, "", cfg.Origin), 204)
	requireStatus(t, grantRequest(f, "GET", "/api/v1/trend/dashboard", token, "", pagesOrigin), 401)
	if count(t, f.db, "trend_sessions") != 0 {
		t.Fatal("logout did not cascade grant revocation")
	}
}

func TestTrendExpiryAndRevocation(t *testing.T) {
	f := trendSetup(t)
	cookie := f.login(t, "")
	token := trendGrant(t, f, cookie)
	exec(t, f.db, "UPDATE trend_sessions SET expires_at=now()-interval '1 second'")
	requireStatus(t, grantRequest(f, "GET", "/api/v1/trend/dashboard", token, "", pagesOrigin), 401)
	token = trendGrant(t, f, cookie)
	requireStatus(t, grantRequest(f, "DELETE", "/api/v1/trend/session", token, "", pagesOrigin), 204)
	requireStatus(t, grantRequest(f, "GET", "/api/v1/trend/dashboard", token, "", pagesOrigin), 401)
	verifier := store.Secret()
	sum := sha256.Sum256([]byte(verifier))
	code, err := f.db.BeginTrendConnect(ctx, strings.SplitN(cookie, "=", 2)[1], pagesOrigin, base64.RawURLEncoding.EncodeToString(sum[:]))
	if err != nil || code == "" {
		t.Fatal("could not create expiring connect code")
	}
	exec(t, f.db, "UPDATE trend_connect_codes SET expires_at=now()-interval '1 second'")
	requireStatus(t, f.request("POST", "/api/v1/trend/exchange", "", fmt.Sprintf(`{"code":%q,"verifier":%q}`, code, verifier), pagesOrigin), 401)
	if err := f.db.Cleanup(ctx); err != nil {
		t.Fatal(err)
	}
	if count(t, f.db, "trend_connect_codes") != 0 || count(t, f.db, "trend_sessions") != 0 {
		t.Fatal("expired connect codes or grants not cleaned")
	}
}

func TestTrendCORSAndMalformedData(t *testing.T) {
	f := trendSetup(t)
	cookie := f.login(t, "")
	for _, body := range []string{
		`null`, `{}`, mutation(-1, "315fc762-613d-4b27-bef1-900686b00001", trendState),
		mutation(0, "bad", trendState), mutation(0, "315fc762-613d-4b27-bef1-900686b00001", strings.Replace(trendState, `"weight":130`, `"weight":0`, 1)),
		mutation(0, "315fc762-613d-4b27-bef1-900686b00001", strings.Replace(trendState, `"version":1`, `"Version":1`, 1)),
		mutation(0, "315fc762-613d-4b27-bef1-900686b00001", strings.Replace(trendState, `"x":5`, `"x":1e999`, 1)),
		mutation(0, "315fc762-613d-4b27-bef1-900686b00001", trendState) + `{}`,
	} {
		requireStatus(t, f.request("PUT", "/api/v1/trend/dashboard", cookie, body, cfg.Origin), 400)
	}
	requireStatus(t, f.request("PUT", "/api/v1/trend/dashboard", cookie, strings.Repeat(" ", 3*1024*1024+1), cfg.Origin), 413)
	if count(t, f.db, "trend_dashboards") != 0 {
		t.Fatal("invalid state persisted")
	}
	for _, origin := range []string{"https://evil.example", pagesOrigin + ".evil.example", "null"} {
		requireStatus(t, f.request("GET", "/api/v1/trend/dashboard", cookie, "", origin), 403)
	}
	r := httptest.NewRequest("OPTIONS", "/api/v1/trend/dashboard", nil)
	r.Header.Set("Origin", pagesOrigin)
	r.Header.Set("Access-Control-Request-Method", "PUT")
	r.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	requireStatus(t, w, 204)
	if w.Header().Get("Access-Control-Allow-Origin") != pagesOrigin || w.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("unsafe CORS")
	}
	for _, path := range []string{"https://evil.example/", "//evil.example/", "/Blog/", "/api/v1/trend/connect?origin=https://evil.example"} {
		requireStatus(t, f.request("GET", "/api/v1/auth/github/start?"+url.Values{"return_to": {path}}.Encode(), "", "", ""), 400)
	}
}
