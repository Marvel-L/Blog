package github

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(code int, body string) *http.Response {
	return &http.Response{StatusCode: code, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}
func TestProviderContract(t *testing.T) {
	calls := 0
	exchange := New(config.Config{Origin: "https://blog.example", ClientID: "client", ClientSecret: "private"}, transport(func(r *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			if r.URL.String() != "https://github.com/login/oauth/access_token" || r.Method != "POST" {
				t.Fatal("untrusted token endpoint")
			}
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if r.Form.Get("code_verifier") != "verifier" || r.Form.Get("redirect_uri") != "https://blog.example/api/v1/auth/github/callback" {
				t.Fatal("missing PKCE/callback")
			}
			return response(200, `{"access_token":"token"}`), nil
		}
		if r.URL.String() != "https://api.github.com/user" || r.Header.Get("Authorization") != "Bearer token" {
			t.Fatal("untrusted identity endpoint")
		}
		return response(200, `{"id":123,"login":"alice","name":null}`), nil
	}))
	user, err := exchange(context.Background(), "code", "verifier")
	if err != nil || user.ID != "123" || user.Name != "alice" || calls != 2 {
		t.Fatal("invalid identity exchange", err)
	}
}
func TestProviderRejectsInvalidResponses(t *testing.T) {
	for _, body := range []string{`{"id":"123","login":"alice"}`, `{"id":0,"login":"alice"}`, `{"id":1.5,"login":"alice"}`, `{"id":9007199254740992,"login":"alice"}`, `{"id":1,"login":""}`, `invalid`} {
		t.Run(body, func(t *testing.T) {
			calls := 0
			exchange := New(config.Config{}, transport(func(*http.Request) (*http.Response, error) {
				calls++
				if calls == 1 {
					return response(200, `{"access_token":"t"}`), nil
				}
				return response(200, body), nil
			}))
			if _, err := exchange(context.Background(), "c", "v"); err == nil {
				t.Fatal("accepted malformed provider identity")
			}
		})
	}
	for _, code := range []int{200, 302, 500} {
		t.Run("token denied", func(t *testing.T) {
			calls := 0
			exchange := New(config.Config{}, transport(func(*http.Request) (*http.Response, error) {
				calls++
				res := response(code, `{"error":"denied"}`)
				res.Header.Set("Location", "https://evil.example")
				return res, nil
			}))
			if _, err := exchange(context.Background(), "c", "v"); err == nil || calls != 1 {
				t.Fatal("followed redirect or accepted provider denial")
			}
		})
	}
}
