package deepseek

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
)

const DiagnosticBodyLimit = 16 * 1024

// Diagnostics belong to the authenticated check detail, never application logs.
// ResponseBody is untrusted plain text, redacted and byte-limited, not a valid score.
type Diagnostic struct {
	Stage             string      `json:"stage"`
	Detail            string      `json:"detail"`
	HTTPStatus        int         `json:"httpStatus,omitempty"`
	RequestID         string      `json:"requestId,omitempty"`
	ResponseReceived  bool        `json:"responseReceived"`
	ResponseComplete  bool        `json:"responseComplete"`
	ResponseTruncated bool        `json:"responseTruncated"`
	ResponseBody      string      `json:"responseBody,omitempty"`
	FinishReason      string      `json:"finishReason,omitempty"`
	ModelReturned     string      `json:"modelReturned,omitempty"`
	Usage             *TokenUsage `json:"usage,omitempty"`
}

type TokenUsage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

var credentialPattern = regexp.MustCompile(`(?i)bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]+`)
var diagnosticIDPattern = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,200}$`)

func boundedDiagnosticText(value, key string) (string, bool) {
	// Redact before truncating so a key spanning the boundary cannot leak a prefix.
	if key != "" {
		value = strings.ReplaceAll(value, key, "[REDACTED]")
		quoted, _ := json.Marshal(key)
		value = strings.ReplaceAll(value, string(quoted[1:len(quoted)-1]), "[REDACTED]")
	}
	value = credentialPattern.ReplaceAllString(value, "[REDACTED]")
	value = strings.ToValidUTF8(value, "�")
	value = strings.ReplaceAll(value, "\x00", "�") // PostgreSQL text/jsonb cannot contain NUL.
	if len(value) <= DiagnosticBodyLimit {
		return value, false
	}
	value = value[:DiagnosticBodyLimit]
	for !utf8.ValidString(value) {
		value = value[:len(value)-1]
	}
	return value, true
}

func diagnosticID(value, key string) string {
	if !diagnosticIDPattern.MatchString(value) || (key != "" && strings.Contains(value, key)) || credentialPattern.MatchString(value) {
		return ""
	}
	return value
}

func diagnosticUsage(raw json.RawMessage) *TokenUsage {
	fields, err := StrictObject(raw)
	if err != nil {
		return nil
	}
	var usage TokenUsage
	for _, field := range []struct {
		name  string
		value *int64
	}{
		{"prompt_tokens", &usage.PromptTokens}, {"completion_tokens", &usage.CompletionTokens}, {"total_tokens", &usage.TotalTokens},
	} {
		value, ok := fields[field.name]
		if !ok || string(value) == "null" || json.Unmarshal(value, field.value) != nil || *field.value < 0 || *field.value > 9007199254740991 {
			return nil
		}
	}
	return &usage
}
