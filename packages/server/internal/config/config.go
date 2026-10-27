package config

import (
	"encoding/base64"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

type Config struct {
	Origin, DatabaseURL, ClientID, ClientSecret string
	PlannerGithubToken, PlannerGithubOwner      string
	PlannerGithubRepo, PlannerGithubBranch      string
	PlannerGithubFile                           string
	Port                                        int
	SecureCookies                               bool
	TrendAllowedOrigins                         []string
	AIEncryptionKey, AIEncryptionKeyID, AIModel string
}

func (c Config) PlannerGitHubEnabled() bool { return c.PlannerGithubToken != "" }

// Load accepts an environment reader so tests never need production credentials.
func Load(get func(string) string) (Config, error) {
	var c Config
	for _, item := range []struct {
		name  string
		value *string
	}{
		{"APP_ORIGIN", &c.Origin}, {"DATABASE_URL", &c.DatabaseURL},
		{"GITHUB_CLIENT_ID", &c.ClientID}, {"GITHUB_CLIENT_SECRET", &c.ClientSecret},
	} {
		*item.value = strings.TrimSpace(get(item.name))
		if *item.value == "" {
			return c, errors.New("missing configuration: " + item.name)
		}
	}
	u, err := url.Parse(c.Origin)
	if err != nil {
		return c, errors.New("invalid APP_ORIGIN")
	}
	local := u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
	if u.Host == "" || (u.Scheme != "https" && !local) || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(c.Origin, "#") || (local && get("NODE_ENV") == "production") {
		return c, errors.New("APP_ORIGIN must be an HTTPS origin (HTTP only on localhost outside production)")
	}
	c.Origin = u.Scheme + "://" + u.Host
	c.SecureCookies = u.Scheme == "https"
	c.PlannerGithubToken = strings.TrimSpace(get("PLANNER_GITHUB_TOKEN"))
	c.PlannerGithubOwner = strings.TrimSpace(get("PLANNER_GITHUB_OWNER"))
	c.PlannerGithubRepo = strings.TrimSpace(get("PLANNER_GITHUB_REPO"))
	c.PlannerGithubBranch = strings.TrimSpace(get("PLANNER_GITHUB_BRANCH"))
	c.PlannerGithubFile = strings.Trim(strings.TrimSpace(get("PLANNER_GITHUB_FILE")), "/")
	if c.PlannerGithubToken != "" {
		if c.PlannerGithubOwner == "" || c.PlannerGithubRepo == "" || c.PlannerGithubBranch == "" || c.PlannerGithubFile == "" ||
			strings.ContainsAny(c.PlannerGithubOwner+c.PlannerGithubRepo+c.PlannerGithubBranch, " /\\?#") ||
			strings.Contains(c.PlannerGithubFile, "..") || strings.ContainsAny(c.PlannerGithubFile, " \\?#") || !strings.HasSuffix(c.PlannerGithubFile, ".md") {
			return c, errors.New("invalid planner GitHub configuration")
		}
	}
	if origins := strings.TrimSpace(get("TREND_ALLOWED_ORIGINS")); origins != "" {
		for _, origin := range strings.Split(origins, ",") {
			origin = strings.TrimSpace(origin)
			parsed, parseErr := url.Parse(origin)
			if parseErr != nil || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || strings.Contains(origin, "#") || strings.Contains(origin, "*") ||
				(parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1"))) {
				return c, errors.New("TREND_ALLOWED_ORIGINS must contain exact HTTPS origins (HTTP only on localhost)")
			}
			c.TrendAllowedOrigins = append(c.TrendAllowedOrigins, origin)
		}
	}
	c.AIEncryptionKey = strings.TrimSpace(get("ANKI_AI_ENCRYPTION_KEY"))
	c.AIEncryptionKeyID = strings.TrimSpace(get("ANKI_AI_ENCRYPTION_KEY_ID"))
	if c.AIEncryptionKeyID == "" {
		c.AIEncryptionKeyID = "v1"
	}
	if len(c.AIEncryptionKeyID) > 64 || strings.ContainsAny(c.AIEncryptionKeyID, " \t\r\n") {
		return c, errors.New("invalid AI encryption key ID")
	}
	if c.AIEncryptionKey != "" {
		key, e := base64.StdEncoding.Strict().DecodeString(c.AIEncryptionKey)
		if e != nil || len(key) != 32 {
			return c, errors.New("ANKI_AI_ENCRYPTION_KEY must be base64 of 32 bytes")
		}
	}
	c.AIModel = strings.TrimSpace(get("ANKI_AI_MODEL"))
	if c.AIModel == "" {
		c.AIModel = "deepseek-flash"
	}
	if c.AIModel != "deepseek-flash" && c.AIModel != "deepseek-v4-pro" {
		return c, errors.New("unsupported ANKI_AI_MODEL")
	}
	c.Port = 3001
	if p := get("PORT"); p != "" {
		c.Port, err = strconv.Atoi(p)
		if err != nil || c.Port < 1 || c.Port > 65535 {
			return c, errors.New("invalid PORT")
		}
	}
	return c, nil
}
