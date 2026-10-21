package github

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
)

type Identity struct{ ID, Login, Name string }
type Exchange func(context.Context, string, string) (Identity, error)

// New uses only fixed provider endpoints. Redirects never carry OAuth credentials.
func New(c config.Config, transport http.RoundTripper) Exchange {
	client := &http.Client{Timeout: 10 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("provider redirect refused") }}
	return func(ctx context.Context, code, verifier string) (Identity, error) {
		var identity Identity
		form := url.Values{"client_id": {c.ClientID}, "client_secret": {c.ClientSecret}, "code": {code}, "code_verifier": {verifier}, "redirect_uri": {c.Origin + "/api/v1/auth/github/callback"}}
		req, err := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
		if err != nil {
			return identity, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		var token struct {
			AccessToken string `json:"access_token"`
		}
		if err = fetch(client, req, &token); err != nil || token.AccessToken == "" {
			return identity, errors.New("provider authorization failed")
		}
		req, err = http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
		if err != nil {
			return identity, err
		}
		req.Header.Set("Authorization", "Bearer "+token.AccessToken)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("User-Agent", "d-blog-server")
		var user struct {
			ID    json.RawMessage `json:"id"`
			Login string          `json:"login"`
			Name  *string         `json:"name"`
		}
		if err = fetch(client, req, &user); err != nil {
			return identity, errors.New("provider identity lookup failed")
		}
		id, err := strconv.ParseInt(string(user.ID), 10, 64)
		if err != nil || id <= 0 || id > 9007199254740991 || user.Login == "" || len([]rune(user.Login)) > 100 {
			return identity, errors.New("invalid provider identity")
		}
		identity = Identity{ID: strconv.FormatInt(id, 10), Login: user.Login, Name: user.Login}
		if user.Name != nil {
			runes := []rune(*user.Name)
			if len(runes) > 200 {
				runes = runes[:200]
			}
			identity.Name = string(runes)
		}
		return identity, nil
	}
}
func fetch(client *http.Client, req *http.Request, out any) error {
	response, err := client.Do(req)
	if err != nil {
		return errors.New("provider unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("provider rejected request")
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(out)
}
