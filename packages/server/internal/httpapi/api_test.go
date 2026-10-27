package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"github.com/Marvel-L/Blog/packages/server/migrations"
	"github.com/jackc/pgx/v5"
)

var cfg = config.Config{Origin: "https://blog.example.com", ClientID: "id", ClientSecret: "secret", SecureCookies: true}
var ctx = context.Background()

type fixture struct {
	db           *store.Store
	handler      http.Handler
	identity     github.Identity
	failExchange bool
	exchanges    int
}

func database(t *testing.T) *store.Store {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		if os.Getenv("CI") != "" {
			t.Fatal("CI requires TEST_DATABASE_URL: real PostgreSQL tests cannot be skipped")
		}
		t.Skip("set TEST_DATABASE_URL to run isolated PostgreSQL integration tests")
	}
	// A fresh schema per test prevents truncating any existing application tables.
	connection, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal("test database unavailable")
	}
	schema := "test_" + strings.ToLower(store.Secret()[:12])
	schema = strings.ReplaceAll(schema, "-", "a")
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err = connection.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	t.Cleanup(func() { _, _ = connection.Exec(ctx, "DROP SCHEMA "+identifier+" CASCADE"); _ = connection.Close(ctx) })
	if err = migrations.Run(ctx, u.String()); err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Pool.Close)
	return db
}
func setup(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{db: database(t), identity: github.Identity{ID: "100", Login: "alice", Name: "Alice"}}
	f.handler = New(cfg, f.db, func(context.Context, string, string) (github.Identity, error) {
		f.exchanges++
		if f.failExchange {
			return github.Identity{}, errors.New("private-token")
		}
		return f.identity, nil
	})
	return f
}
func (f *fixture) request(method, path, cookie, body, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:1234"
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}
func requireStatus(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d, expected %d; %s", w.Code, status, w.Body.String())
	}
}

// duePast 仅测试用：把指定卡的到期时间拨到过去，使其可再次被合法评价。
// 生产守卫（未到期 409）不放松，测试用隔离 DB 直接改排期来模拟“明天再练”。
func (f *fixture) duePast(t *testing.T, cardID string) {
	t.Helper()
	if _, err := f.db.Pool.Exec(context.Background(),
		"UPDATE anki_cards SET due_at = clock_timestamp() - interval '1 hour' WHERE id=$1", cardID); err != nil {
		t.Fatal(err)
	}
}
func (f *fixture) authorize(t *testing.T) (string, string, *url.URL) {
	t.Helper()
	w := f.request("GET", "/api/v1/auth/github/start", "", "", "")
	requireStatus(t, w, 302)
	u, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].Secure || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode || cookies[0].Path != "/" || cookies[0].MaxAge != 600 {
		t.Fatal("unsafe state cookie")
	}
	return u.Query().Get("state"), cookies[0].Name + "=" + cookies[0].Value, u
}
func (f *fixture) login(t *testing.T, old string) string {
	t.Helper()
	state, cookie, _ := f.authorize(t)
	if old != "" {
		cookie += "; " + old
	}
	w := f.request("GET", "/api/v1/auth/github/callback?code=code&state="+state, cookie, "", "")
	requireStatus(t, w, 302)
	if w.Header().Get("Location") != "/Blog/" {
		t.Fatal("invalid return destination")
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-dblog_session" {
			if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.MaxAge != 604800 {
				t.Fatal("unsafe session cookie")
			}
			return c.Name + "=" + c.Value
		}
	}
	t.Fatal("missing session")
	return ""
}
func event() map[string]any {
	return map[string]any{"eventId": "315fc762-613d-4b27-bef1-900686b00001", "name": "page_view", "path": "/Blog/post/hello", "occurredAt": time.Now().UTC().Format(time.RFC3339Nano)}
}
func batch(e map[string]any) string {
	b, _ := json.Marshal(map[string]any{"events": []any{e}})
	return string(b)
}
func count(t *testing.T, db *store.Store, table string) int {
	t.Helper()
	var n int
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
func exec(t *testing.T, db *store.Store, sql string) {
	t.Helper()
	if _, err := db.Pool.Exec(ctx, sql); err != nil {
		t.Fatal(err)
	}
}

func TestOAuthPKCEAndSingleUse(t *testing.T) {
	f := setup(t)
	state, cookie, u := f.authorize(t)
	if u.Host != "github.com" || u.Query().Has("scope") || u.Query().Get("code_challenge_method") != "S256" {
		t.Fatal("invalid provider authorization")
	}
	var verifier string
	if err := f.db.Pool.QueryRow(ctx, "SELECT verifier FROM oauth_attempts WHERE state_hash=$1", store.Hash(state)).Scan(&verifier); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(verifier))
	if u.Query().Get("code_challenge") != base64.RawURLEncoding.EncodeToString(sum[:]) {
		t.Fatal("PKCE mismatch")
	}
	path := "/api/v1/auth/github/callback?code=code&state=" + state
	requireStatus(t, f.request("GET", path, "", "", ""), 400)
	requireStatus(t, f.request("GET", path, cookie, "", ""), 302)
	requireStatus(t, f.request("GET", path, cookie, "", ""), 400)
	if f.exchanges != 1 {
		t.Fatal("replayed provider authorization")
	}
}
func TestExpiredAndMalformedAuthorization(t *testing.T) {
	for _, suffix := range []string{"expired", "&state=duplicate", "&code=duplicate", "&code="} {
		t.Run(suffix, func(t *testing.T) {
			f := setup(t)
			state, cookie, _ := f.authorize(t)
			path := "/api/v1/auth/github/callback?code=c&state=" + state
			if suffix == "expired" {
				exec(t, f.db, "UPDATE oauth_attempts SET expires_at=now()-interval '1 second'")
			} else {
				path += suffix
			}
			requireStatus(t, f.request("GET", path, cookie, "", ""), 400)
			if f.exchanges != 0 {
				t.Fatal("invalid authorization reached provider")
			}
		})
	}
}
func TestSessionsPersistenceAndReplacement(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	token := strings.SplitN(cookie, "=", 2)[1]
	var digest string
	if err := f.db.Pool.QueryRow(ctx, "SELECT token_hash FROM sessions").Scan(&digest); err != nil || digest != store.Hash(token) {
		t.Fatal("raw token or incompatible session digest")
	}
	w := f.request("GET", "/api/v1/me", cookie, "", "")
	requireStatus(t, w, 200)
	if !strings.Contains(w.Body.String(), `"login":"alice"`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("identity/cache contract mismatch")
	}
	w = f.request("GET", "/api/v1/me/events", cookie, "", "")
	if !strings.Contains(w.Body.String(), "login_success") {
		t.Fatal("missing server login audit")
	}
	replacement := f.login(t, cookie)
	if count(t, f.db, "sessions") != 1 {
		t.Fatal("old session still stored")
	}
	if !strings.Contains(f.request("GET", "/api/v1/me", cookie, "", "").Body.String(), `"user":null`) {
		t.Fatal("old session still authenticates")
	}
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", replacement, "", ""), 403)
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", replacement, "", "https://evil.example"), 403)
	requireStatus(t, f.request("POST", "/api/v1/auth/logout", replacement, "", cfg.Origin), 204)
	if count(t, f.db, "sessions") != 0 {
		t.Fatal("logout did not revoke session")
	}
}
func TestExistingNodeSessionCompatibility(t *testing.T) {
	f := setup(t)
	// SHA-256 of a 43-character base64url token, as stored by the previous Node service.
	token := "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	exec(t, f.db, `INSERT INTO users(id,github_id,login,name) VALUES('315fc762-613d-4b27-bef1-900686b00002','legacy','legacy','Legacy')`)
	_, err := f.db.Pool.Exec(ctx, `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'315fc762-613d-4b27-bef1-900686b00002',now()+interval '1 day')`, "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a")
	if err != nil {
		t.Fatal(err)
	}
	w := f.request("GET", "/api/v1/me", "__Host-dblog_session="+token, "", "")
	if !strings.Contains(w.Body.String(), `"login":"legacy"`) {
		t.Fatal("legacy session lost")
	}
	exec(t, f.db, "UPDATE sessions SET expires_at=now()-interval '1 second'")
	if !strings.Contains(f.request("GET", "/api/v1/me", "__Host-dblog_session="+token, "", "").Body.String(), `"user":null`) {
		t.Fatal("expired session authenticated")
	}
}
func TestEventIdempotencyAndAccountIsolation(t *testing.T) {
	f := setup(t)
	alice := f.login(t, "")
	payload := batch(event())
	requireStatus(t, f.request("POST", "/api/v1/events/batch", "", payload, cfg.Origin), 401)
	for i, want := range []string{`"accepted":1`, `"accepted":0`} {
		w := f.request("POST", "/api/v1/events/batch", alice, payload, cfg.Origin)
		requireStatus(t, w, 200)
		if !strings.Contains(w.Body.String(), want) {
			t.Fatalf("retry %d not idempotent", i)
		}
	}
	f.identity = github.Identity{ID: "200", Login: "bob", Name: "Bob"}
	bob := f.login(t, "")
	if strings.Contains(f.request("GET", "/api/v1/me/events", bob, "", "").Body.String(), "page_view") {
		t.Fatal("events crossed accounts")
	}
	requireStatus(t, f.request("POST", "/api/v1/events/batch", bob, payload, cfg.Origin), 200)
	if count(t, f.db, "user_events") != 4 {
		t.Fatal("cross-account dedup key incorrect")
	}
}
func TestInvalidEventsAndJSON(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	for key, values := range map[string][]any{"user_id": {"forged"}, "name": {"login_success", nil}, "path": {"/Blog/?token=secret", "/Blog/#secret", "/Blog/back\\slash", "/Blog/a b", "https://evil.example", strings.Repeat("x", 501), nil}, "occurredAt": {"invalid", "2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z", nil}, "eventId": {"invalid", nil}, "properties": {map[string]string{"token": "secret"}}, "EventID": {"315fc762-613d-4b27-bef1-900686b00001"}} {
		for _, v := range values {
			t.Run(key, func(t *testing.T) {
				e := event()
				e[key] = v
				requireStatus(t, f.request("POST", "/api/v1/events/batch", cookie, batch(e), cfg.Origin), 400)
			})
		}
	}
	for _, body := range []string{`{}`, `null`, `{"events":[]}`, `{"events":null}`, `{"events":[]} {}`, `{"events":[{}]}`, `{"events":[],"user_id":"forged"}`, `{`} {
		requireStatus(t, f.request("POST", "/api/v1/events/batch", cookie, body, cfg.Origin), 400)
	}
	list := []any{}
	for range 21 {
		list = append(list, event())
	}
	b, _ := json.Marshal(map[string]any{"events": list})
	requireStatus(t, f.request("POST", "/api/v1/events/batch", cookie, string(b), cfg.Origin), 400)
	requireStatus(t, f.request("POST", "/api/v1/events/batch", cookie, `{"events":[{"path":"`+strings.Repeat("x", 33000)+`"}]}`, cfg.Origin), 413)
	if count(t, f.db, "user_events") != 1 {
		t.Fatal("invalid events reached database")
	}
}
func TestProviderAndPersistenceFailuresAreRedacted(t *testing.T) {
	f := setup(t)
	f.failExchange = true
	state, cookie, _ := f.authorize(t)
	w := f.request("GET", "/api/v1/auth/github/callback?code=private-code&state="+state, cookie, "", "")
	requireStatus(t, w, 503)
	if strings.Contains(w.Body.String(), "private") || count(t, f.db, "sessions") != 0 {
		t.Fatal("provider failure leaked or created session")
	}
	f.failExchange = false
	session := f.login(t, "")
	exec(t, f.db, "ALTER TABLE user_events RENAME TO unavailable_events")
	w = f.request("POST", "/api/v1/events/batch", session, batch(event()), cfg.Origin)
	requireStatus(t, w, 503)
	if strings.Contains(w.Body.String(), "unavailable_events") {
		t.Fatal("database error leaked")
	}
	// A failed audit insert must roll back replacement revocation and new session/user creation.
	f.identity = github.Identity{ID: "300", Login: "failed", Name: "Failed"}
	state, cookie, _ = f.authorize(t)
	requireStatus(t, f.request("GET", "/api/v1/auth/github/callback?code=c&state="+state, cookie+"; "+session, "", ""), 503)
	if count(t, f.db, "sessions") != 1 || count(t, f.db, "users") != 1 {
		t.Fatal("login transaction partially committed")
	}
	exec(t, f.db, "ALTER TABLE users RENAME TO unavailable_users")
	requireStatus(t, f.request("GET", "/api/v1/health", "", "", ""), 503)
}
func TestCleanupAndRecentLimit(t *testing.T) {
	f := setup(t)
	cookie := f.login(t, "")
	for i := 0; i < 22; i++ {
		e := event()
		e["eventId"] = fmt.Sprintf("315fc762-613d-4b27-bef1-%012d", i)
		requireStatus(t, f.request("POST", "/api/v1/events/batch", cookie, batch(e), cfg.Origin), 200)
	}
	var result struct {
		Events []store.RecentEvent `json:"events"`
	}
	w := f.request("GET", "/api/v1/me/events", cookie, "", "")
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result.Events) != 20 {
		t.Fatal("recent limit or response shape mismatch")
	}
	f.authorize(t)
	exec(t, f.db, "UPDATE user_events SET received_at=now()-interval '91 days';UPDATE sessions SET expires_at=now()-interval '1 second';UPDATE oauth_attempts SET expires_at=now()-interval '1 second'")
	if err := f.db.Cleanup(ctx); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"user_events", "sessions", "oauth_attempts"} {
		if count(t, f.db, table) != 0 {
			t.Fatal("retention failed", table)
		}
	}
}
func TestMigrationSerializationAndRollback(t *testing.T) {
	db := database(t)
	databaseURL := db.Pool.Config().ConnConfig.ConnString()
	exec(t, db, `INSERT INTO users(id,github_id,login,name) VALUES('315fc762-613d-4b27-bef1-900686b00002','keep','keep','Keep')`)
	var wg sync.WaitGroup
	results := make(chan error, 4)
	for range 4 {
		wg.Go(func() { results <- migrations.Run(ctx, databaseURL) })
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	if count(t, db, "schema_migrations") != 5 || count(t, db, "users") != 1 {
		t.Fatal("migration rewrote existing data")
	}
	bad := fstest.MapFS{"999_failure.sql": &fstest.MapFile{Data: []byte("CREATE TABLE rollback_probe(id integer); SELECT * FROM nonexistent_table;")}}
	if migrations.Apply(ctx, databaseURL, bad) == nil {
		t.Fatal("invalid migration succeeded")
	}
	var exists bool
	if err := db.Pool.QueryRow(ctx, "SELECT to_regclass('rollback_probe') IS NOT NULL").Scan(&exists); err != nil || exists || count(t, db, "schema_migrations") != 5 {
		t.Fatal("migration failed to roll back")
	}
}
func TestLimitsAndBasicHTTPWithoutDatabase(t *testing.T) {
	handler := New(cfg, nil, nil)
	call := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", path, nil)
		r.RemoteAddr = "127.0.0.1:99"
		handler.ServeHTTP(w, r)
		return w
	}
	for range 120 {
		w := call("/api/v1/me")
		requireStatus(t, w, 200)
		if w.Body.String() != "{\"user\":null}\n" {
			t.Fatal("anonymous response changed")
		}
	}
	requireStatus(t, call("/api/v1/me"), 429)
	l := limiter{entries: make(map[string]window)}
	now := time.Now()
	for range 10 {
		if !l.allow("a", true, now) {
			t.Fatal("early auth limit")
		}
	}
	if l.allow("a", true, now) {
		t.Fatal("auth limit missing")
	}
	if !l.allow("a", true, now.Add(time.Minute)) {
		t.Fatal("limit did not expire")
	}
}

func TestConcurrentOAuthAndEventDeduplication(t *testing.T) {
	f := setup(t)
	state, _, _ := f.authorize(t)
	var wg sync.WaitGroup
	results := make(chan string, 4)
	for range 4 {
		wg.Go(func() {
			verifier, err := f.db.ConsumeOAuth(ctx, state)
			if err != nil {
				results <- "error"
				return
			}
			results <- verifier
		})
	}
	wg.Wait()
	close(results)
	consumed := 0
	for verifier := range results {
		if verifier == "error" {
			t.Fatal("concurrent OAuth SQL failed")
		}
		if verifier != "" {
			consumed++
		}
	}
	if consumed != 1 {
		t.Fatal("authorization consumed more than once")
	}
	cookie := f.login(t, "")
	u, err := f.db.FindUser(ctx, strings.SplitN(cookie, "=", 2)[1])
	if err != nil {
		t.Fatal(err)
	}
	var events []store.Event
	payload := event()
	raw, _ := json.Marshal(payload)
	var item store.Event
	if err = json.Unmarshal(raw, &item); err != nil {
		t.Fatal(err)
	}
	events = append(events, item)
	accepted := make(chan int64, 4)
	for range 4 {
		wg.Go(func() {
			n, err := f.db.RecordEvents(ctx, u.ID, events)
			if err != nil {
				accepted <- -100
				return
			}
			accepted <- n
		})
	}
	wg.Wait()
	close(accepted)
	var total int64
	for n := range accepted {
		total += n
	}
	if total != 1 {
		t.Fatal("concurrent retry was not idempotent")
	}
}

func TestJSONAndTransportGuards(t *testing.T) {
	handler := New(cfg, nil, nil)
	for _, tc := range []struct {
		method, path, body, content string
		origins                     []string
		want                        int
	}{
		{"POST", "/api/v1/events/batch", "{}", "text/plain", []string{cfg.Origin}, 415},
		{"POST", "/api/v1/auth/logout", "", "", []string{cfg.Origin, cfg.Origin}, 403},
		{"GET", "/api/v1/me", "", "", nil, 200},
		{"GET", "/api/v1/me/events", "", "", nil, 401},
		{"GET", "/api/v1/me", "", "", nil, 200},
	} {
		r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		r.Header["Origin"] = tc.origins
		r.Header.Set("Content-Type", tc.content)
		r.Header.Set("Cookie", "__Host-dblog_session=malformed")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		requireStatus(t, w, tc.want)
		if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("API cache/CORS headers changed")
		}
	}
	e := event()
	e["EventId"] = e["eventId"]
	delete(e, "eventId")
	raw := batch(e)
	var value json.RawMessage = []byte(raw)
	if _, err := decodeBatch(value); err == nil {
		t.Fatal("case-insensitive JSON event key accepted")
	}
	if _, err := decodeBatch([]byte(`{"Events":[]}`)); err == nil {
		t.Fatal("case-insensitive JSON batch key accepted")
	}
}
