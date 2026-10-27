package config

import (
	"encoding/base64"
	"testing"
)

func TestAIConfiguration(t *testing.T) {
	base := map[string]string{"APP_ORIGIN": "https://app.example.com", "DATABASE_URL": "test", "GITHUB_CLIENT_ID": "id", "GITHUB_CLIENT_SECRET": "secret"}
	load := func(extra map[string]string) (Config, error) {
		return Load(func(key string) string {
			if value, ok := extra[key]; ok {
				return value
			}
			return base[key]
		})
	}
	c, err := load(nil)
	if err != nil || c.AIEncryptionKey != "" || c.AIModel != "deepseek-flash" {
		t.Fatal("optional AI disabled config failed")
	}
	valid := base64.StdEncoding.EncodeToString(make([]byte, 32))
	if _, err = load(map[string]string{"ANKI_AI_ENCRYPTION_KEY": valid}); err != nil {
		t.Fatal(err)
	}
	for _, extra := range []map[string]string{{"ANKI_AI_ENCRYPTION_KEY": "bad"}, {"ANKI_AI_ENCRYPTION_KEY": base64.StdEncoding.EncodeToString(make([]byte, 16))}, {"ANKI_AI_MODEL": "arbitrary"}, {"ANKI_AI_ENCRYPTION_KEY_ID": "invalid id"}} {
		if _, err := load(extra); err == nil {
			t.Fatal("invalid AI configuration accepted")
		}
	}
}

func TestConfiguration(t *testing.T) {
	base := map[string]string{"APP_ORIGIN": "https://43.138.216.53/", "DATABASE_URL": "test", "GITHUB_CLIENT_ID": "id", "GITHUB_CLIENT_SECRET": "secret"}
	load := func(overrides map[string]string) (Config, error) {
		return Load(func(k string) string {
			if v, ok := overrides[k]; ok {
				return v
			}
			return base[k]
		})
	}
	c, err := load(nil)
	if err != nil || !c.SecureCookies || c.Origin != "https://43.138.216.53" || c.Port != 3001 {
		t.Fatalf("invalid valid config: %+v %v", c, err)
	}
	for _, bad := range []map[string]string{
		{"APP_ORIGIN": "http://43.138.216.53"}, {"APP_ORIGIN": "https://example.com/Blog"}, {"APP_ORIGIN": "https://user:pass@example.com"},
		{"APP_ORIGIN": "https://example.com?x=y"}, {"APP_ORIGIN": "https://example.com#"}, {"APP_ORIGIN": "https:///"},
		{"APP_ORIGIN": "http://localhost:3000", "NODE_ENV": "production"}, {"PORT": "NaN"}, {"PORT": "0"}, {"PORT": "65536"}, {"DATABASE_URL": ""}, {"GITHUB_CLIENT_SECRET": ""},
	} {
		t.Run("reject", func(t *testing.T) {
			if _, err := load(bad); err == nil {
				t.Fatal("accepted invalid configuration")
			}
		})
	}
	c, err = load(map[string]string{"APP_ORIGIN": "http://localhost:3000", "PORT": "3002"})
	if err != nil || c.SecureCookies || c.Port != 3002 {
		t.Fatal("local development config rejected")
	}
	c, err = load(map[string]string{"TREND_ALLOWED_ORIGINS": "https://marvel-l.github.io,http://localhost:3000"})
	if err != nil || len(c.TrendAllowedOrigins) != 2 {
		t.Fatal("exact Trend origins rejected")
	}
	c, err = load(map[string]string{"PLANNER_GITHUB_TOKEN": "token", "PLANNER_GITHUB_OWNER": "Marvel-L", "PLANNER_GITHUB_REPO": "Blog", "PLANNER_GITHUB_BRANCH": "custom", "PLANNER_GITHUB_FILE": "planner-data/monthly-planner.md"})
	if err != nil || !c.PlannerGitHubEnabled() {
		t.Fatal("valid planner GitHub configuration rejected")
	}
	for _, bad := range []map[string]string{
		{"PLANNER_GITHUB_TOKEN": "token"},
		{"PLANNER_GITHUB_TOKEN": "token", "PLANNER_GITHUB_OWNER": "Marvel-L", "PLANNER_GITHUB_REPO": "Blog", "PLANNER_GITHUB_BRANCH": "custom", "PLANNER_GITHUB_FILE": "../private.md"},
	} {
		if _, err := load(bad); err == nil {
			t.Fatal("invalid planner GitHub configuration accepted")
		}
	}
	for _, origin := range []string{"*", "https://*.example.com", "https://example.com/Blog", "https://example.com/", "https://user:pass@example.com", "http://example.com", "https://example.com#", "https://example.com,"} {
		if _, err := load(map[string]string{"TREND_ALLOWED_ORIGINS": origin}); err == nil {
			t.Fatal("invalid Trend origin accepted")
		}
	}
}
