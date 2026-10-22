package config

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
)

type Config struct {
	Origin, DatabaseURL, ClientID, ClientSecret string
	Port                                        int
	SecureCookies                               bool
	TrendAllowedOrigins                         []string
}

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
	c.Port = 3001
	if p := get("PORT"); p != "" {
		c.Port, err = strconv.Atoi(p)
		if err != nil || c.Port < 1 || c.Port > 65535 {
			return c, errors.New("invalid PORT")
		}
	}
	return c, nil
}
