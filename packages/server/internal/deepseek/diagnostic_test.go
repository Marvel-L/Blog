package deepseek

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestFailureDiagnosticKeepsResponseWithoutScoring(t *testing.T) {
	invalid := strings.Replace(fixtureResult, `"score":72`, `"score":"72"`, 1)
	body := `{"model":"test-model","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15,"secret":"test-private-key"},"choices":[{"finish_reason":"stop","message":{"content":` + strconv.Quote(invalid) + `}}]}`
	calls := 0
	client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}, "X-Request-Id": []string{"request-123"}}, Body: io.NopCloser(strings.NewReader(body))}, nil
	}))
	completion, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
	var safe *Error
	if !errors.As(err, &safe) || safe.Diagnostic == nil || safe.Code != "AI_RESULT_INVALID" || calls != 1 || completion.Content != "" {
		t.Fatal("diagnostic missing or invalid score accepted", err)
	}
	d := safe.Diagnostic
	if d.Stage != "result_validation" || d.Detail != "score 必须是 0–100 的整数。" || d.HTTPStatus != 200 || d.RequestID != "request-123" || !d.ResponseReceived || !d.ResponseComplete || d.ResponseTruncated || d.FinishReason != "stop" || d.ModelReturned != "test-model" || d.Usage == nil || d.Usage.TotalTokens != 15 {
		t.Fatalf("wrong diagnostic: %+v", d)
	}
	serialized, _ := json.Marshal(d)
	if strings.Contains(string(serialized), "test-private-key") || !strings.Contains(d.ResponseBody, `\"score\":\"72\"`) || err.Error() != "AI_RESULT_INVALID" {
		t.Fatal("raw response lost or key leaked")
	}
}

func TestDiagnosticHTTPBodyIsBoundedAndRedacted(t *testing.T) {
	for _, status := range []int{401, 402, 429, 500, 302} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			key := "test-private-key"
			body := `Bearer another-secret sk-other-secret ` + key + "\x00" + strings.Repeat("中", 10000)
			calls := 0
			client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: status, Header: http.Header{"X-Request-Id": []string{key}, "Location": []string{"https://attacker.invalid"}}, Body: io.NopCloser(strings.NewReader(body))}, nil
			}))
			_, err := client.Check(context.Background(), key, "test-model", SystemPrompt, "data")
			var safe *Error
			if !errors.As(err, &safe) || safe.Diagnostic == nil || calls != 1 {
				t.Fatal("missing error or unexpected retry")
			}
			d := safe.Diagnostic
			if d.Stage != "http_status" || d.HTTPStatus != status || !d.ResponseTruncated || !d.ResponseComplete || d.RequestID != "" || len(d.ResponseBody) > DiagnosticBodyLimit || !utf8.ValidString(d.ResponseBody) || strings.ContainsAny(d.ResponseBody, "\x00") || strings.Contains(d.ResponseBody, key) || strings.Contains(d.ResponseBody, "another-secret") || strings.Contains(d.ResponseBody, "sk-other-secret") {
				t.Fatal("unsafe diagnostic body")
			}
		})
	}
}

func TestDiagnosticResultReasons(t *testing.T) {
	for _, tc := range []struct{ raw, reason string }{
		{strings.Replace(fixtureResult, `"score":72,`, "", 1), "缺少必填字段：score。"},
		{strings.Replace(fixtureResult, `"strengths":[]`, `"strengths":null`, 1), "字段不能为 null：strengths。"},
		{strings.Replace(fixtureResult, `"strengths":[]`, `"strengths":{}`, 1), "strengths 必须是字符串数组。"},
		{strings.Replace(fixtureResult, `["补充关闭语义"]`, `[]`, 1), "suggestions 至少需要一条明确建议。"},
		{strings.Replace(fixtureResult, `["补充关闭语义"]`, `[null]`, 1), "suggestions 的每项必须为非空字符串且不超过 3000 字。"},
	} {
		_, err := ParseResult(tc.raw)
		if err == nil || err.Error() != tc.reason {
			t.Fatalf("wrong reason: %v", err)
		}
	}
}

func TestDiagnosticRedactionBoundaryAndMissingUsage(t *testing.T) {
	key := "test-secret-boundary"
	text := strings.Repeat("x", DiagnosticBodyLimit-5) + key + "tail"
	value, truncated := boundedDiagnosticText(text, key)
	if !truncated || strings.Contains(value, "test-") || len(value) > DiagnosticBodyLimit {
		t.Fatal("credential prefix leaked at excerpt boundary")
	}
	for _, raw := range []string{`{}`, `null`, `{"total_tokens":12}`, `{"prompt_tokens":null,"completion_tokens":0,"total_tokens":0}`, `{"prompt_tokens":1,"completion_tokens":2,"total_tokens":9007199254740992}`} {
		if diagnosticUsage(json.RawMessage(raw)) != nil {
			t.Fatal("missing or invalid usage fabricated as zero")
		}
	}
}

func TestDiagnosticEnvelopeAndTransportStages(t *testing.T) {
	for _, tc := range []struct{ name, contentType, body, code, stage string }{
		{"invalid json", "application/json", `{`, "AI_RESPONSE_INVALID", "response_envelope"},
		{"invalid content type", "text/html", `<script>alert(1)</script>`, "AI_RESPONSE_INVALID", "response_envelope"},
		{"unfinished", "application/json", `{"model":"test","choices":[{"finish_reason":"length","message":{"content":"partial"}}]}`, "AI_RESPONSE_INCOMPLETE", "response_finish"},
		{"too large", "application/json", strings.Repeat("x", 256*1024+5), "AI_RESPONSE_TOO_LARGE", "response_body"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{tc.contentType}}, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			}))
			_, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
			var safe *Error
			if !errors.As(err, &safe) || safe.Diagnostic == nil || safe.Code != tc.code || safe.Diagnostic.Stage != tc.stage || len(safe.Diagnostic.ResponseBody) > DiagnosticBodyLimit {
				t.Fatal("wrong diagnostic", err)
			}
		})
	}
	client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) { return nil, context.DeadlineExceeded }))
	_, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
	var safe *Error
	if !errors.As(err, &safe) || safe.Code != "AI_TIMEOUT" || safe.Diagnostic == nil || safe.Diagnostic.ResponseReceived || safe.Diagnostic.Stage != "transport" {
		t.Fatal("wrong transport diagnostic", err)
	}
}
