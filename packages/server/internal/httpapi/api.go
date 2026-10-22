// Package httpapi keeps the browser contract independent of the runtime language.
package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type Persistence interface {
	Ready(context.Context) error
	BeginOAuth(context.Context, string, string) error
	ConsumeOAuth(context.Context, string) (string, error)
	BeginOAuthReturn(context.Context, string, string, string) error
	ConsumeOAuthReturn(context.Context, string) (string, string, error)
	Login(context.Context, github.Identity, string) (string, error)
	FindUser(context.Context, string) (*store.User, error)
	Logout(context.Context, string) error
	RecordEvents(context.Context, string, []store.Event) (int64, error)
	RecentEvents(context.Context, string) ([]store.RecentEvent, error)
	Trend(context.Context, string) (store.TrendSnapshot, error)
	SaveTrend(context.Context, string, int64, string, json.RawMessage) (store.TrendSnapshot, bool, error)
	BeginTrendConnect(context.Context, string, string, string) (string, error)
	ExchangeTrend(context.Context, string, string, string) (string, *store.User, error)
	FindTrendUser(context.Context, string, string) (*store.User, error)
	RevokeTrend(context.Context, string, string) error
}
type API struct {
	config                     config.Config
	db                         Persistence
	exchange                   github.Exchange
	sessionCookie, stateCookie string
	limit                      limiter
}

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func New(c config.Config, db Persistence, exchange github.Exchange) http.Handler {
	a := &API{config: c, db: db, exchange: exchange, sessionCookie: "dblog_session_dev", stateCookie: "dblog_oauth_dev", limit: limiter{entries: make(map[string]window)}}
	if c.SecureCookies {
		a.sessionCookie = "__Host-dblog_session"
		a.stateCookie = "__Host-dblog_oauth"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("GET /api/v1/me", a.me)
	mux.HandleFunc("GET /api/v1/auth/github/start", a.start)
	mux.HandleFunc("GET /api/v1/auth/github/callback", a.callback)
	mux.HandleFunc("POST /api/v1/auth/logout", a.logout)
	mux.HandleFunc("POST /api/v1/events/batch", a.events)
	mux.HandleFunc("GET /api/v1/me/events", a.recent)
	mux.HandleFunc("GET /api/v1/trend/dashboard", a.getTrend)
	mux.HandleFunc("PUT /api/v1/trend/dashboard", a.putTrend)
	mux.HandleFunc("GET /api/v1/trend/connect", a.connectTrend)
	mux.HandleFunc("POST /api/v1/trend/exchange", a.exchangeTrend)
	mux.HandleFunc("DELETE /api/v1/trend/session", a.revokeTrend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Never log requests or recovered values: URLs and panic values may contain credentials.
		defer func() {
			if recover() != nil {
				failure(w, 503)
			}
		}()
		isTrend := strings.HasPrefix(r.URL.Path, "/api/v1/trend/")
		if isTrend && !a.trendCORS(w, r) {
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" && (len(r.Header.Values("Origin")) != 1 || (!isTrend && r.Header.Get("Origin") != c.Origin)) {
			failure(w, 403)
			return
		}
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		auth := r.URL.Path == "/api/v1/auth/github/start" || r.URL.Path == "/api/v1/trend/connect" || r.URL.Path == "/api/v1/trend/exchange"
		if !a.limit.allow(ip, auth, time.Now()) {
			w.Header().Set("Retry-After", "60")
			failure(w, 429)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
		defer cancel()
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}
func failure(w http.ResponseWriter, status int) {
	message := "请求无效或过于频繁"
	if status == 503 {
		message = "服务暂时不可用，请稍后重试"
	}
	respond(w, status, map[string]string{"error": message})
}
func (a *API) cookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: a.config.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}
func cookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}
func (a *API) user(r *http.Request) (*store.User, error) {
	token := cookieValue(r, a.sessionCookie)
	if !tokenPattern.MatchString(token) {
		return nil, nil
	}
	return a.db.FindUser(r.Context(), token)
}
func (a *API) health(w http.ResponseWriter, r *http.Request) {
	if a.db.Ready(r.Context()) != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]string{"status": "ok", "version": "0.3.0"})
}
func (a *API) me(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]any{"user": u})
}
func (a *API) start(w http.ResponseWriter, r *http.Request) {
	returnPath := "/Blog/"
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || len(query["return_to"]) > 1 {
		failure(w, 400)
		return
	}
	if path := query.Get("return_to"); path != "" {
		if !a.validTrendReturn(path) {
			failure(w, 400)
			return
		}
		returnPath = path
	}
	state, verifier := store.Secret(), store.Secret()
	if a.db.BeginOAuthReturn(r.Context(), state, verifier, returnPath) != nil {
		failure(w, 503)
		return
	}
	challenge := sha256.Sum256([]byte(verifier))
	params := url.Values{"client_id": {a.config.ClientID}, "redirect_uri": {a.config.Origin + "/api/v1/auth/github/callback"}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"}}
	a.cookie(w, a.stateCookie, state, 600)
	http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+params.Encode(), 302)
}
func (a *API) callback(w http.ResponseWriter, r *http.Request) {
	a.cookie(w, a.stateCookie, "", -1)
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		failure(w, 400)
		return
	}
	state, code := query.Get("state"), query.Get("code")
	browserState := cookieValue(r, a.stateCookie)
	left, right := sha256.Sum256([]byte(state)), sha256.Sum256([]byte(browserState))
	if len(query["state"]) != 1 || !tokenPattern.MatchString(state) || !tokenPattern.MatchString(browserState) || subtle.ConstantTimeCompare(left[:], right[:]) != 1 {
		failure(w, 400)
		return
	}
	verifier, returnPath, err := a.db.ConsumeOAuthReturn(r.Context(), state)
	if err != nil {
		failure(w, 503)
		return
	}
	if verifier == "" || (returnPath != "/Blog/" && !a.validTrendReturn(returnPath)) || len(query["code"]) != 1 || code == "" || len(code) > 512 {
		failure(w, 400)
		return
	}
	identity, err := a.exchange(r.Context(), code, verifier)
	if err != nil {
		failure(w, 503)
		return
	}
	token, err := a.db.Login(r.Context(), identity, cookieValue(r, a.sessionCookie))
	if err != nil {
		failure(w, 503)
		return
	}
	a.cookie(w, a.sessionCookie, token, 7*24*3600)
	http.Redirect(w, r, returnPath, 302)
}
func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if token := cookieValue(r, a.sessionCookie); token != "" {
		if a.db.Logout(r.Context(), token) != nil {
			failure(w, 503)
			return
		}
	}
	a.cookie(w, a.sessionCookie, "", -1)
	w.WriteHeader(204)
}
func (a *API) events(w http.ResponseWriter, r *http.Request) {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		failure(w, 415)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var raw json.RawMessage
	if err = decoder.Decode(&raw); err == nil {
		var extra any
		err = decoder.Decode(&extra)
		if err == io.EOF {
			err = nil
		} else if err == nil {
			err = errors.New("trailing JSON")
		}
	}
	if err != nil {
		var size *http.MaxBytesError
		if errors.As(err, &size) {
			failure(w, 413)
		} else {
			failure(w, 400)
		}
		return
	}
	events, err := decodeBatch(raw)
	if err != nil {
		failure(w, 400)
		return
	}
	body := struct{ Events []store.Event }{events}

	if len(body.Events) < 1 || len(body.Events) > 20 {
		failure(w, 400)
		return
	}
	now := time.Now()
	for _, e := range body.Events {
		if !uuidPattern.MatchString(e.EventID) || e.Name != "page_view" || !validPath(e.Path) || e.OccurredAt.Before(now.Add(-24*time.Hour)) || e.OccurredAt.After(now.Add(5*time.Minute)) {
			failure(w, 400)
			return
		}
	}
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	accepted, err := a.db.RecordEvents(r.Context(), u.ID, body.Events)
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]int64{"accepted": accepted})
}
func validPath(path string) bool {
	if !strings.HasPrefix(path, "/Blog/") || !utf8.ValidString(path) || utf8.RuneCountInString(path) > 500 {
		return false
	}
	for _, c := range path {
		if c <= ' ' || c == '?' || c == '#' || c == '\\' {
			return false
		}
	}
	return true
}
func (a *API) recent(w http.ResponseWriter, r *http.Request) {
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	events, err := a.db.RecentEvents(r.Context(), u.ID)
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]any{"events": events})
}

type window struct {
	expires     time.Time
	total, auth int
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]window
	sweep   time.Time
}

// No proxy headers are trusted. Expired buckets are pruned and allocation is capped.
func (l *limiter) allow(ip string, auth bool, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !now.Before(l.sweep) {
		for k, v := range l.entries {
			if !now.Before(v.expires) {
				delete(l.entries, k)
			}
		}
		l.sweep = now.Add(time.Minute)
	}
	v, exists := l.entries[ip]
	if !exists || !now.Before(v.expires) {
		if !exists && len(l.entries) >= 10000 {
			return false
		}
		v = window{expires: now.Add(time.Minute)}
	}
	v.total++
	if auth {
		v.auth++
	}
	l.entries[ip] = v
	return v.total <= 120 && (!auth || v.auth <= 10)
}

// encoding/json accepts case-insensitive field names by default; the public API
// deliberately permits only the exact browser payload keys.
func decodeBatch(raw json.RawMessage) ([]store.Event, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, err
	}
	if len(top) != 1 || top["events"] == nil {
		return nil, errors.New("invalid batch")
	}
	var items []json.RawMessage
	if err := json.Unmarshal(top["events"], &items); err != nil {
		return nil, err
	}
	events := make([]store.Event, 0, len(items))
	for _, item := range items {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(item, &fields); err != nil {
			return nil, err
		}
		if len(fields) != 4 {
			return nil, errors.New("invalid event")
		}
		for _, key := range []string{"eventId", "name", "path", "occurredAt"} {
			if fields[key] == nil || string(fields[key]) == "null" {
				return nil, errors.New("missing event field")
			}
		}
		var event store.Event
		if err := json.Unmarshal(item, &event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}
