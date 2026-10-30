package deepseek

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

const fixtureResult = `{"score":72,"summary":"方向正确","strengths":[],"issues":[],"suggestions":["补充关闭语义"]}`

func TestParseResult(t *testing.T) {
	for _, raw := range []string{fixtureResult, strings.Replace(fixtureResult, `72`, `0`, 1), strings.Replace(fixtureResult, `72`, `100`, 1)} {
		if _, err := ParseResult(raw); err != nil {
			t.Fatal(err)
		}
	}
	for _, raw := range []string{strings.Replace(fixtureResult, `72`, `-1`, 1), strings.Replace(fixtureResult, `72`, `101`, 1), strings.Replace(fixtureResult, `72`, `72.5`, 1), strings.Replace(fixtureResult, `72`, `"72"`, 1), strings.Replace(fixtureResult, `"score":72`, `"score":72,"score":99`, 1), strings.Replace(fixtureResult, `["补充关闭语义"]`, `[]`, 1), strings.Replace(fixtureResult, `["补充关闭语义"]`, `[null]`, 1), strings.Replace(fixtureResult, `"strengths":[]`, `"strengths":null`, 1), fixtureResult + ` {}`, ``, "```json\n" + fixtureResult + "\n```"} {
		if _, err := ParseResult(raw); err == nil {
			t.Fatalf("accepted invalid %s", raw)
		}
	}
}
func TestCipherIsolationAndNonce(t *testing.T) {
	c, err := NewCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	a, n, err := c.Encrypt("alice", 1, "test-private-key")
	if err != nil {
		t.Fatal(err)
	}
	b, m, _ := c.Encrypt("alice", 1, "test-private-key")
	if string(a) == string(b) || string(n) == string(m) {
		t.Fatal("nonce reused")
	}
	plain, err := c.Decrypt("alice", 1, a, n)
	if err != nil || plain != "test-private-key" {
		t.Fatal("roundtrip failed")
	}
	if _, err = c.Decrypt("bob", 1, a, n); err == nil {
		t.Fatal("user binding missing")
	}
	if _, err = c.Decrypt("alice", 2, a, n); err == nil {
		t.Fatal("version binding missing")
	}
	if _, err = c.Decrypt("alice", 1, a, nil); err == nil {
		t.Fatal("nonce validation missing")
	}
	if _, err = NewCipher("bad"); err == nil {
		t.Fatal("bad master accepted")
	}
}

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type failingBody struct{ err error }

func (b failingBody) Read([]byte) (int, error) { return 0, b.err }
func (b failingBody) Close() error             { return nil }

type bodyTimeout struct{}

func (bodyTimeout) Error() string   { return "body timeout" }
func (bodyTimeout) Timeout() bool   { return true }
func (bodyTimeout) Temporary() bool { return true }

func TestClientBodyReadFailuresDoNotRetry(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		code string
	}{
		{"deadline", context.DeadlineExceeded, "AI_TIMEOUT"},
		{"network timeout", bodyTimeout{}, "AI_TIMEOUT"},
		{"connection lost", io.ErrUnexpectedEOF, "AI_REQUEST_UNKNOWN"},
		{"cancelled", context.Canceled, "AI_REQUEST_UNKNOWN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: failingBody{tc.err}}, nil
			}))
			completion, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
			var safe *Error
			if !errors.As(err, &safe) || safe.Code != tc.code || calls != 1 || completion.Content != "" {
				t.Fatalf("wrong body error or automatic retry: error=%v calls=%d", err, calls)
			}
		})
	}
}

func TestClientSingleRoundAndSafeErrors(t *testing.T) {
	calls := 0
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != Endpoint || r.Header.Get("Authorization") != "Bearer test-private-key" {
			t.Fatal("unsafe request")
		}
		body, _ := io.ReadAll(r.Body)
		s := string(body)
		if !strings.Contains(s, `"stream":false`) || !strings.Contains(s, `"json_object"`) || strings.Count(s, `"role"`) != 2 {
			t.Fatal("invalid single round payload")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"model":"test-model","choices":[{"finish_reason":"stop","message":{"content":` + strconv.Quote(fixtureResult) + `}}],"usage":{"total_tokens":10}}`))}, nil
	})
	client := NewClient(transport)
	result, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, UserPrompt("question", "answer"))
	if err != nil || result.Result.Score != 72 || calls != 1 {
		t.Fatal("completion failed", err)
	}
	for _, status := range []int{401, 402, 429, 500, 302} {
		calls = 0
		client = NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: status, Header: http.Header{"Location": []string{"https://attacker.invalid"}}, Body: io.NopCloser(strings.NewReader("test-private-key"))}, nil
		}))
		_, err = client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
		if err == nil || strings.Contains(err.Error(), "test-private-key") || calls != 1 {
			t.Fatal("unsafe error or automatic retry")
		}
	}
}
