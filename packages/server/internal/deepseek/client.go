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

func requestError(ctx context.Context, err error) *Error {
	var timeout net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return &Error{Code: "AI_TIMEOUT"}
	}
	return &Error{Code: "AI_REQUEST_UNKNOWN"}
}

// Error() exposes only a safe business code, not upstream payloads or credentials.
type Error struct {
	Code       string
	Diagnostic *Diagnostic
}

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
	diagnostic := &Diagnostic{Stage: "request", Detail: "请求构造失败。"}
	fail := func(code string) (Completion, error) {
		return Completion{}, &Error{Code: code, Diagnostic: diagnostic}
	}
	body := map[string]any{"model": model, "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": prompt}}, "response_format": map[string]string{"type": "json_object"}, "thinking": map[string]string{"type": "disabled"}, "temperature": 0.2, "max_tokens": 2048, "stream": false}
	raw, err := json.Marshal(body)
	if err != nil {
		return fail("AI_REQUEST_INVALID")
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, Endpoint, bytes.NewReader(raw))
	if err != nil {
		return fail("AI_REQUEST_INVALID")
	}
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+key)
	response, err := c.http.Do(r)
	if err != nil {
		diagnostic.Stage = "transport"
		diagnostic.Detail = "请求未取得可用响应，费用是否产生无法确定。"
		code := requestError(ctx, err).Code
		if code == "AI_TIMEOUT" {
			diagnostic.Detail = "等待响应超时，费用是否产生无法确定。"
		} else if errors.Is(err, context.Canceled) {
			diagnostic.Detail = "请求被取消，不能据此判断是否已产生费用。"
		}
		return fail(code)
	}
	defer response.Body.Close()
	diagnostic.ResponseReceived = true
	diagnostic.HTTPStatus = response.StatusCode
	diagnostic.RequestID = diagnosticID(response.Header.Get("X-Request-Id"), key)
	diagnostic.Stage = "response_body"
	// Read with the existing 256 KiB hard cap before redaction, then retain only
	// 16 KiB. This keeps credentials spanning the excerpt boundary redacted.
	limit := 256 * 1024
	raw, err = io.ReadAll(io.LimitReader(response.Body, int64(limit+1)))
	diagnostic.ResponseBody, diagnostic.ResponseTruncated = boundedDiagnosticText(string(raw), key)
	diagnostic.ResponseComplete = err == nil && len(raw) <= limit
	if len(raw) > limit {
		diagnostic.ResponseTruncated = true
	}
	if response.StatusCode != 200 {
		diagnostic.Stage = "http_status"
		diagnostic.Detail = "上游返回非成功 HTTP 状态；保留已读取的响应片段，未自动重试。"
		code := "AI_UPSTREAM_ERROR"
		switch response.StatusCode {
		case 401:
			code = "AI_KEY_INVALID"
		case 402:
			code = "AI_BALANCE_INSUFFICIENT"
		case 429:
			code = "AI_RATE_LIMITED"
		}
		return fail(code)
	}
	if err != nil {
		code := requestError(ctx, err).Code
		diagnostic.Detail = "响应正文读取中断，只保留已读取的片段。"
		if code == "AI_TIMEOUT" {
			diagnostic.Detail = "响应正文读取超时，只保留已读取的片段。"
		}
		return fail(code)
	}
	if len(raw) > 256*1024 {
		diagnostic.Detail = "响应正文超过 256 KiB 解析上限。"
		return fail("AI_RESPONSE_TOO_LARGE")
	}
	diagnostic.Stage = "response_envelope"
	if !strings.Contains(response.Header.Get("Content-Type"), "application/json") {
		diagnostic.Detail = "响应 Content-Type 不是 application/json。"
		return fail("AI_RESPONSE_INVALID")
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
	if json.Unmarshal(raw, &envelope) != nil {
		diagnostic.Detail = "响应外层 JSON 无法解析或字段类型不符。"
		return fail("AI_RESPONSE_INVALID")
	}
	if len(envelope.Choices) != 1 || len(envelope.Model) > 200 {
		diagnostic.Detail = "响应 choices 必须只有一项，model 长度不能超过 200 字节。"
		return fail("AI_RESPONSE_INVALID")
	}
	diagnostic.ModelReturned = diagnosticID(envelope.Model, key)
	diagnostic.FinishReason = diagnosticID(envelope.Choices[0].Finish, key)
	diagnostic.Usage = diagnosticUsage(envelope.Usage)
	if envelope.Choices[0].Finish != "stop" {
		diagnostic.Stage = "response_finish"
		diagnostic.Detail = "AI 输出未正常结束，finish_reason 不是 stop。"
		return fail("AI_RESPONSE_INCOMPLETE")
	}
	content := envelope.Choices[0].Message.Content
	result, err := ParseResult(content)
	if err != nil {
		diagnostic.Stage = "result_validation"
		diagnostic.Detail = err.Error() // ParseResult returns only fixed safe field names/reasons.
		return fail("AI_RESULT_INVALID")
	}
	return Completion{content, result, envelope.Model, envelope.Usage}, nil
}
