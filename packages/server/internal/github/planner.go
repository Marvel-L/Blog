package github

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/config"
)

type PlannerCommitter func(context.Context, string, string, int64) error

type contentsFile struct {
	Sha string `json:"sha"`
}

func NewPlannerCommitter(c config.Config, transport http.RoundTripper) PlannerCommitter {
	client := &http.Client{Timeout: 15 * time.Second, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("provider redirect refused") }}
	return func(ctx context.Context, login, markdown string, revision int64) error {
		if !c.PlannerGitHubEnabled() {
			return nil
		}
		login = strings.ToLower(login)
		if login == "" {
			return errors.New("invalid login")
		}
		for _, char := range login {
			if !((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '-') {
				return errors.New("invalid login")
			}
		}
		filePath := strings.Trim(c.PlannerGithubPath, "/") + "/" + login + ".md"
		endpoint := "https://api.github.com/repos/" + url.PathEscape(c.PlannerGithubOwner) + "/" + url.PathEscape(c.PlannerGithubRepo) + "/contents/" + strings.Join(strings.Split(filePath, "/"), "/")
		sha := ""
		req, err := http.NewRequestWithContext(ctx, "GET", endpoint+"?ref="+url.QueryEscape(c.PlannerGithubBranch), nil)
		if err != nil {
			return err
		}
		plannerHeaders(req, c.PlannerGithubToken)
		response, err := client.Do(req)
		if err != nil {
			return errors.New("github unavailable")
		}
		if response.StatusCode == 200 {
			var current contentsFile
			err = json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&current)
			sha = current.Sha
		}
		response.Body.Close()
		if err != nil || (response.StatusCode != 200 && response.StatusCode != 404) {
			return errors.New("github read failed")
		}
		payload := map[string]any{"message": fmt.Sprintf("更新 %s 的月度计划（版本 %d）", login, revision), "content": base64.StdEncoding.EncodeToString([]byte(markdown)), "branch": c.PlannerGithubBranch}
		if sha != "" {
			payload["sha"] = sha
		}
		body, _ := json.Marshal(payload)
		req, err = http.NewRequestWithContext(ctx, "PUT", endpoint, bytes.NewReader(body))
		if err != nil {
			return err
		}
		plannerHeaders(req, c.PlannerGithubToken)
		req.Header.Set("Content-Type", "application/json")
		response, err = client.Do(req)
		if err != nil {
			return errors.New("github unavailable")
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return errors.New("github commit rejected")
		}
		return nil
	}
}
func plannerHeaders(req *http.Request, token string) {
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "d-blog-planner")
}
