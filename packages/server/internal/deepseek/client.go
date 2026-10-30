package deepseek

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const Endpoint = "https://api.deepseek.com/chat/completions"

// Header and body reads share the same timeout classification; neither is retried.
func requestError(ctx context.Context, err error) *Error {
	var timeout net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return &Error{"AI_TIMEOUT"}
	}
	return &Error{"AI_REQUEST_UNKNOWN"}
}

// Error exposes only a safe business code, never upstream payloads or credentials.
type Error struct{ Code string }

func (e *Error) Error() string { return e.Code }

type Completion struct {
	Content string
	Result  Result
	Model   string
	Usage   json.RawMessage
}
type Client struct{ http *http.Client }

func NewClient(transport http.RoundTripper) *Client {
	if transport == nil {
		transport = &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}).DialContext, TLSHandshakeTimeout: 8 * time.Second, ResponseHeaderTimeout: 90 * time.Second, MaxIdleConns: 4, MaxIdleConnsPerHost: 2, IdleConnTimeout: 60 * time.Second}
	}
	return &Client{http: &http.Client{Transport: transport, Timeout: 90 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (c *Client) Check(ctx context.Context, key, model, system, prompt string) (Completion, error) {
	body := map[string]any{"model": model, "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": prompt}}, "response_format": map[string]string{"type": "json_object"}, "thinking": map[string]string{"type": "disabled"}, "temperature": 0.2, "max_tokens": 2048, "stream": false}
	raw, err := json.Marshal(body)
	if err != nil {
		return Completion{}, &Error{"AI_REQUEST_INVALID"}
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, Endpoint, bytes.NewReader(raw))
	if err != nil {
		return Completion{}, &Error{"AI_REQUEST_INVALID"}
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+key)
	response, err := c.http.Do(r)
	if err != nil {
		return Completion{}, requestError(ctx, err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		code := "AI_UPSTREAM_ERROR"
		switch response.StatusCode {
		case 401:
			code = "AI_KEY_INVALID"
		case 402:
			code = "AI_BALANCE_INSUFFICIENT"
		case 429:
			code = "AI_RATE_LIMITED"
		}
		return Completion{}, &Error{code}
	}
	if !strings.Contains(response.Header.Get("Content-Type"), "application/json") {
		return Completion{}, &Error{"AI_RESPONSE_INVALID"}
	}
	raw, err = io.ReadAll(io.LimitReader(response.Body, 256*1024+1))
	if err != nil {
		return Completion{}, requestError(ctx, err)
	}
	if len(raw) > 256*1024 {
		return Completion{}, &Error{"AI_RESPONSE_TOO_LARGE"}
	}
	var envelope struct {
		Model   string          `json:"model"`
		Usage   json.RawMessage `json:"usage"`
		Choices []struct {
			Finish  string `json:"finish_reason"`
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &envelope) != nil || len(envelope.Choices) != 1 || len(envelope.Model) > 200 {
		return Completion{}, &Error{"AI_RESPONSE_INVALID"}
	}
	if envelope.Choices[0].Finish != "stop" {
		return Completion{}, &Error{"AI_RESPONSE_INCOMPLETE"}
	}
	content := envelope.Choices[0].Message.Content
	result, err := ParseResult(content)
	if err != nil {
		return Completion{}, &Error{"AI_RESULT_INVALID"}
	}
	return Completion{content, result, envelope.Model, envelope.Usage}, nil
}
