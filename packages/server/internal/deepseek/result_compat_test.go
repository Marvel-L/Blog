package deepseek

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

// This is the reported scoring content, replayed locally without contacting AI.
const leftJoinResultWithNullNote = `{"score":25,"summary":"结论：核心结论错误，把 SQL LEFT JOIN 未匹配列误说成返回类型默认值；关键判断：未匹配右表列在 SQL 中返回 NULL，不是空串或 0","strengths":["正确点：提到“设置了特定空值的时候会返回对应的空值”；理由：说明回答者意识到结果可能受默认值或空值设置影响，但这一说法在 LEFT JOIN 未匹配列的语境下并不成立"],"issues":["原文：否则返回系统默认值\n问题：【错误】LEFT JOIN 右表无匹配行时，右表列在结果集中为 NULL，而不是 varchar 的 \"\" 或 int 的 0；数据库不会因为列类型自动填充类型默认值\n修正：==LEFT JOIN 未匹配的右表列返回 SQL NULL==，与列类型无关","原文：例如 varchar 返回 \"\", int 返回 0\n问题：【错误】这是把编程语言或建表默认值概念混入查询结果；SQL 查询结果中未匹配列为 NULL，只有显式使用 COALESCE、IFNULL 等函数才会替换成 \"\" 或 0\n修正：==需要空串或 0 时必须显式转换==，例如 COALESCE(r.name, '')、COALESCE(r.age, 0)","原文：如果右表不存在字段，设置了特定空值的时候 会返回对应的空值\n问题：【不严谨】“右表不存在字段”表述有歧义，应指右表没有匹配行；且列默认值不会改变 LEFT JOIN 未匹配行的结果，只有查询中的 COALESCE 等表达式才会\n修正：==LEFT JOIN 保留左表全部行，右表无匹配时右表列为 NULL==；列默认值只影响 INSERT 未提供值时的存储，不影响外连接结果","原文：未提及\n问题：【遗漏】没有说明判断 NULL 必须用 IS NULL，不能用 = NULL，也没有说明 COUNT(r.id) 不统计未匹配行等常见边界\n修正：==判断未匹配行可用 r.id IS NULL==；COUNT(r.id) 会忽略 NULL，COUNT(*) 不会"],"suggestions":["修正版回答：\nLEFT JOIN 会保留左表的全部行；当右表没有匹配行时，==结果集中右表的所有列都为 SQL NULL==，与列类型无关，不会因为 varchar 就返回 \"\"，也不会因为 int 就返回 0。列默认值只影响 INSERT 时未提供值的情况，不影响外连接查询结果。\n\n如果需要把 NULL 展示成特定值，必须显式转换，例如 ==COALESCE(r.name, '')== 返回空串，==COALESCE(r.age, 0)== 返回 0；MySQL 也可用 IFNULL。\n\n判断某行是否未匹配，应使用 ==r.id IS NULL==，不能写 r.id = NULL。统计右表匹配数量时，==COUNT(r.id) 会忽略 NULL==，而 COUNT(*) 会计入左表保留行。","改进建议：用一张左表和一张右表构造“有匹配、无匹配”两类数据，分别查询原始右表列、COALESCE 后的列和 COUNT(r.id)，观察 NULL 与 0/空串的差异。","改进建议：回答时先明确“右表无匹配行”这一前提，再说明结果值、显式替换方式和 NULL 判断方式，避免把列默认值与查询结果混为一谈。"],"suggestions_note":null}`

func TestParseResultIgnoresOnlyNullExtraFields(t *testing.T) {
	want, err := ParseResult(fixtureResult)
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{
		strings.TrimSuffix(fixtureResult, "}") + `,"suggestions_note":null}`,
		`{"note": null,` + strings.TrimPrefix(fixtureResult, "{"),
		strings.TrimSuffix(fixtureResult, "}") + `,"note":null,"unused": null }`,
	} {
		got, err := ParseResult(raw)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("null metadata changed scoring fields: result=%+v error=%v", got, err)
		}
	}
	// StrictObject is also used for user-controlled API requests; keep its whitelist strict.
	if _, err := StrictObject([]byte(`{"apiKey":"fixture","note":null}`), "apiKey"); err == nil {
		t.Fatal("shared request validation accepted an extra field")
	}
}

func TestParseResultNullMetadataDoesNotWeakenValidation(t *testing.T) {
	withNote := strings.TrimSuffix(fixtureResult, "}") + `,"suggestions_note":null}`
	for _, tc := range []struct{ name, raw, reason string }{
		{"extra string", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":"note"`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"extra empty string", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":""`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"extra array", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":[]`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"extra object", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":{}`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"extra number", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":0`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"extra boolean", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":false`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"duplicate core field", strings.Replace(withNote, `"score":72`, `"score":72,"score":99`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"duplicate null field", strings.Replace(withNote, `"suggestions_note":null`, `"suggestions_note":null,"suggestions_note":null`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"escaped duplicate", strings.Replace(withNote, `"score":72`, `"score":72,"\u0073core":99`, 1), "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"trailing object", withNote + ` {}`, "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"trailing text", withNote + ` done`, "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"markdown fence", "```json\n" + withNote + "\n```", "评分内容不是严格 JSON 对象，或包含重复、额外字段或尾随内容。"},
		{"missing core field", strings.Replace(withNote, `"score":72,`, "", 1), "缺少必填字段：score。"},
		{"null core field", strings.Replace(withNote, `"score":72`, `"score":null`, 1), "字段不能为 null：score。"},
		{"invalid score type", strings.Replace(withNote, `"score":72`, `"score":"72"`, 1), "score 必须是 0–100 的整数。"},
		{"invalid score range", strings.Replace(withNote, `"score":72`, `"score":101`, 1), "score 必须是 0–100 的整数。"},
		{"invalid array type", strings.Replace(withNote, `"issues":[]`, `"issues":{}`, 1), "issues 必须是字符串数组。"},
		{"empty suggestions", strings.Replace(withNote, `["补充关闭语义"]`, `[]`, 1), "suggestions 至少需要一条明确建议。"},
		{"null suggestion", strings.Replace(withNote, `["补充关闭语义"]`, `[null]`, 1), "suggestions 的每项必须为非空字符串且不超过 3000 字。"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseResult(tc.raw)
			if err == nil || err.Error() != tc.reason {
				t.Fatalf("unexpected validation result: %v", err)
			}
		})
	}
}

func TestClientReportedLeftJoinResponse(t *testing.T) {
	want, err := ParseResult(strings.Replace(leftJoinResultWithNullNote, `,"suggestions_note":null`, "", 1))
	if err != nil || want.Score != 25 || len(want.Issues) != 4 || len(want.Suggestions) != 3 {
		t.Fatal("invalid reported fixture", err)
	}
	for _, tc := range []struct {
		name, content, finish string
		valid                 bool
	}{
		{"null metadata", leftJoinResultWithNullNote, "stop", true},
		{"non-null metadata", strings.Replace(leftJoinResultWithNullNote, `"suggestions_note":null`, `"suggestions_note":"unexpected"`, 1), "stop", false},
		{"incomplete output", leftJoinResultWithNullNote, "length", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			usage := json.RawMessage(`{"prompt_tokens":1300,"completion_tokens":764,"total_tokens":2064,"prompt_cache_hit_tokens":1024}`)
			body, err := json.Marshal(map[string]any{
				"model": "test-model", "usage": usage,
				"choices": []any{map[string]any{"index": 0, "finish_reason": tc.finish, "message": map[string]string{"role": "assistant", "content": tc.content}}},
			})
			if err != nil {
				t.Fatal(err)
			}
			calls := 0
			client := NewClient(roundTrip(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
			}))
			completion, err := client.Check(context.Background(), "test-private-key", "test-model", SystemPrompt, "data")
			if calls != 1 {
				t.Fatalf("unexpected automatic retry: %d requests", calls)
			}
			if tc.valid {
				if err != nil || !reflect.DeepEqual(completion.Result, want) || completion.Content != tc.content || completion.Model != "test-model" || string(completion.Usage) != string(usage) {
					t.Fatalf("reported response failed or content changed: %v", err)
				}
				canonical, err := json.Marshal(completion.Result)
				if err != nil {
					t.Fatal(err)
				}
				fields, err := StrictObject(canonical, "score", "summary", "strengths", "issues", "suggestions")
				if err != nil || len(fields) != 5 {
					t.Fatal("normalized scoring result must contain only five fields", err)
				}
				return
			}
			code, stage := "AI_RESULT_INVALID", "result_validation"
			if tc.finish != "stop" {
				code, stage = "AI_RESPONSE_INCOMPLETE", "response_finish"
			}
			var safe *Error
			if !errors.As(err, &safe) || safe.Code != code || safe.Diagnostic == nil || safe.Diagnostic.Stage != stage || safe.Diagnostic.HTTPStatus != 200 || !safe.Diagnostic.ResponseComplete || safe.Diagnostic.Usage == nil || safe.Diagnostic.Usage.TotalTokens != 2064 || completion.Content != "" {
				t.Fatalf("invalid response scored or diagnostic lost: %v", err)
			}
		})
	}
}
