package config

import "testing"

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
}
