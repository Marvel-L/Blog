package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func (a *API) allowedTrendOrigin(origin string) bool {
	if origin == a.config.Origin {
		return true
	}
	for _, allowed := range a.config.TrendAllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}
func (a *API) trendCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := r.Header.Get("Origin")
	w.Header().Add("Vary", "Origin")
	if len(r.Header.Values("Origin")) > 1 || (origin != "" && !a.allowedTrendOrigin(origin)) {
		failure(w, 403)
		return false
	}
	if origin != "" && origin != a.config.Origin {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	if r.Method != "OPTIONS" {
		return true
	}
	method := r.Header.Get("Access-Control-Request-Method")
	if origin == "" || (method != "GET" && method != "PUT" && method != "POST" && method != "DELETE") {
		failure(w, 403)
		return false
	}
	for _, h := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
		h = strings.ToLower(strings.TrimSpace(h))
		if h != "" && h != "authorization" && h != "content-type" {
			failure(w, 403)
			return false
		}
	}
	w.Header().Add("Vary", "Access-Control-Request-Method")
	w.Header().Add("Vary", "Access-Control-Request-Headers")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.WriteHeader(204)
	return false
}
func (a *API) trendUser(r *http.Request) (*store.User, error) {
	if auth := r.Header.Get("Authorization"); auth != "" {
		if len(r.Header.Values("Authorization")) != 1 || !strings.HasPrefix(auth, "Bearer ") || !tokenPattern.MatchString(auth[7:]) || r.Header.Get("Origin") == "" {
			return nil, nil
		}
		return a.db.FindTrendUser(r.Context(), auth[7:], r.Header.Get("Origin"))
	}
	// Cross-origin callers must exchange a code; cookies remain same-origin.
	if origin := r.Header.Get("Origin"); origin != "" && origin != a.config.Origin {
		return nil, nil
	}
	return a.user(r)
}
func (a *API) getTrend(w http.ResponseWriter, r *http.Request) {
	u, err := a.trendUser(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	v, err := a.db.Trend(r.Context(), u.ID)
	if err != nil {
		failure(w, 503)
		return
	}
	respond(w, 200, map[string]any{"user": u, "dashboard": v})
}
func jsonBody(w http.ResponseWriter, r *http.Request, max int64) (json.RawMessage, bool) {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		failure(w, 415)
		return nil, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, max)
	d := json.NewDecoder(r.Body)
	var raw json.RawMessage
	err = d.Decode(&raw)
	if err == nil {
		var extra any
		err = d.Decode(&extra)
		if err == io.EOF {
			return raw, true
		}
	}
	var size *http.MaxBytesError
	if errors.As(err, &size) {
		failure(w, 413)
	} else {
		failure(w, 400)
	}
	return nil, false
}
func (a *API) putTrend(w http.ResponseWriter, r *http.Request) {
	u, err := a.trendUser(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	raw, ok := jsonBody(w, r, 3*1024*1024)
	if !ok {
		return
	}
	m, err := fields(raw, "baseRevision", "mutationId", "state")
	var base int64
	var mutation string
	if err != nil || json.Unmarshal(m["baseRevision"], &base) != nil || base < 0 || base >= 9007199254740991 ||
		json.Unmarshal(m["mutationId"], &mutation) != nil || !uuidPattern.MatchString(mutation) || !validTrendState(m["state"]) {
		failure(w, 400)
		return
	}
	v, conflict, err := a.db.SaveTrend(r.Context(), u.ID, base, strings.ToLower(mutation), m["state"])
	if errors.Is(err, store.ErrMutationReuse) {
		failure(w, 400)
		return
	}
	if err != nil {
		failure(w, 503)
		return
	}
	status := 200
	if conflict {
		status = 409
	}
	respond(w, status, map[string]any{"user": u, "dashboard": v})
}
func (a *API) validTrendReturn(path string) bool {
	u, err := url.Parse(path)
	if err != nil || u.Scheme != "" || u.Host != "" || u.Path != "/api/v1/trend/connect" || u.Fragment != "" {
		return false
	}
	q, err := url.ParseQuery(u.RawQuery)
	return err == nil && len(q) == 3 && len(q["origin"]) == 1 && len(q["state"]) == 1 && len(q["challenge"]) == 1 &&
		a.allowedTrendOrigin(q.Get("origin")) && tokenPattern.MatchString(q.Get("state")) && tokenPattern.MatchString(q.Get("challenge"))
}
func (a *API) connectTrend(w http.ResponseWriter, r *http.Request) {
	path := r.URL.RequestURI()
	if !a.validTrendReturn(path) {
		failure(w, 400)
		return
	}
	u, err := a.user(r)
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		http.Redirect(w, r, "/api/v1/auth/github/start?"+url.Values{"return_to": {path}}.Encode(), 302)
		return
	}
	q := r.URL.Query()
	code, err := a.db.BeginTrendConnect(r.Context(), cookieValue(r, a.sessionCookie), q.Get("origin"), q.Get("challenge"))
	if err != nil {
		failure(w, 503)
		return
	}
	if code == "" {
		failure(w, 401)
		return
	}
	payload, _ := json.Marshal(map[string]string{"type": "dblog-trend-code", "state": q.Get("state"), "code": code})
	target, _ := json.Marshal(q.Get("origin"))
	nonce := store.Secret()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+nonce+"'; frame-ancestors 'none'; base-uri 'none'")
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Trend 授权</title><p>授权完成，可关闭此窗口返回 Trend。</p><script nonce="%s">if(window.opener){window.opener.postMessage(%s,%s);window.close()}</script></html>`, nonce, payload, target)
}
func (a *API) exchangeTrend(w http.ResponseWriter, r *http.Request) {
	raw, ok := jsonBody(w, r, 4096)
	if !ok {
		return
	}
	m, err := fields(raw, "code", "verifier")
	var code, verifier string
	if err != nil || json.Unmarshal(m["code"], &code) != nil || json.Unmarshal(m["verifier"], &verifier) != nil || !tokenPattern.MatchString(code) || !tokenPattern.MatchString(verifier) {
		failure(w, 400)
		return
	}
	sum := sha256.Sum256([]byte(verifier))
	token, u, err := a.db.ExchangeTrend(r.Context(), code, r.Header.Get("Origin"), base64.RawURLEncoding.EncodeToString(sum[:]))
	if err != nil {
		failure(w, 503)
		return
	}
	if u == nil {
		failure(w, 401)
		return
	}
	respond(w, 200, map[string]any{"token": token, "user": u, "expiresIn": 3600})
}
func (a *API) revokeTrend(w http.ResponseWriter, r *http.Request) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || !tokenPattern.MatchString(auth[7:]) {
		failure(w, 401)
		return
	}
	if a.db.RevokeTrend(r.Context(), auth[7:], r.Header.Get("Origin")) != nil {
		failure(w, 503)
		return
	}
	w.WriteHeader(204)
}
