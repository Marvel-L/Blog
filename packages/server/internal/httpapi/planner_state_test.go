package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPlannerStateAndMarkdown(t *testing.T) {
	valid := json.RawMessage(`{"version":1,"months":{"2026-10":[{"id":"launch","text":"发布月度规划","completed":false},{"id":"verified","text":"完成测试","completed":true}]}}`)
	markdown, ok := plannerMarkdown(valid)
	if !ok || !strings.Contains(markdown, "## 2026-10") || !strings.Contains(markdown, "- [x] 完成测试 <!-- id:verified -->") {
		t.Fatal("valid planner was not converted to markdown")
	}
	for _, raw := range []string{
		`{"version":1,"months":null}`,
		`{"version":1,"months":{"1969-12":[]}}`,
		`{"version":1,"months":{"2026-13":[]}}`,
		`{"version":1,"months":{"2abc-01":[]}}`,
		`{"version":1,"months":{"2026-10":[{"id":"bad/id","text":"x","completed":false}]}}`,
		`{"version":1,"months":{"2026-10":[{"id":"a","text":"","completed":false}]}}`,
	} {
		if _, ok := plannerMarkdown(json.RawMessage(raw)); ok {
			t.Fatalf("invalid planner accepted: %s", raw)
		}
	}
	if _, ok := plannerText(json.RawMessage(`"` + strings.Repeat("😀", 251) + `"`)); ok {
		t.Fatal("server text limit differs from frontend UTF-16 limit")
	}
}
