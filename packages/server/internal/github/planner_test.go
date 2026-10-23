package github

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func plannerResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func TestPlannerCommitterCreatesAndUpdatesFile(t *testing.T) {
	cfg := config.Config{PlannerGithubToken: "secret", PlannerGithubOwner: "Marvel-L", PlannerGithubRepo: "Blog", PlannerGithubBranch: "custom", PlannerGithubFile: "public/planner-data/monthly-planner.md"}
	calls := 0
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "Bearer secret" || !strings.Contains(r.URL.Path, "/repos/Marvel-L/Blog/contents/public/planner-data/monthly-planner.md") {
			t.Fatal("unsafe or incorrect GitHub request")
		}
		if r.Method == "GET" {
			return plannerResponse(200, `{"sha":"old-sha"}`), nil
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil || body["sha"] != "old-sha" || body["branch"] != "custom" {
			t.Fatal("missing update precondition")
		}
		decoded, err := base64.StdEncoding.DecodeString(body["content"].(string))
		if err != nil || string(decoded) != "# Monthly Planner\n" {
			t.Fatal("invalid markdown payload")
		}
		return plannerResponse(200, `{}`), nil
	})
	if err := NewPlannerCommitter(cfg, transport)(context.Background(), "Alice", "# Monthly Planner\n", 3); err != nil || calls != 2 {
		t.Fatal("planner commit failed", err, calls)
	}
}

func TestPlannerCommitterRejectsUnsafeLoginAndRedirect(t *testing.T) {
	cfg := config.Config{PlannerGithubToken: "secret", PlannerGithubOwner: "Marvel-L", PlannerGithubRepo: "Blog", PlannerGithubBranch: "custom", PlannerGithubFile: "public/planner-data/monthly-planner.md"}
	committer := NewPlannerCommitter(cfg, roundTrip(func(*http.Request) (*http.Response, error) { return plannerResponse(302, ""), nil }))
	if committer(context.Background(), "../admin", "x", 1) == nil {
		t.Fatal("unsafe login accepted")
	}
	if committer(context.Background(), "alice", "x", 1) == nil {
		t.Fatal("provider redirect/status accepted")
	}
}
