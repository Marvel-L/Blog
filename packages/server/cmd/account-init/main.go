// Offline account initialization. Password hashes arrive on stdin, never argv or logs.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "账号初始化失败：检查输入、数据库、已有绑定；未输出凭据")
		os.Exit(1)
	}
	fmt.Println("系统账号已初始化，原 GitHub 身份和业务数据保留")
}
func run() error {
	var input struct {
		Username     string `json:"username"`
		PasswordHash string `json:"passwordHash"`
		GitHubID     string `json:"githubId"`
	}
	d := json.NewDecoder(io.LimitReader(os.Stdin, 4096))
	d.DisallowUnknownFields()
	if err := d.Decode(&input); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("trailing input")
	}
	if !store.ValidUsername(input.Username) || !store.ValidPasswordHash(input.PasswordHash) || input.GitHubID == "" {
		return errors.New("invalid input")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := store.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.Pool.Close()
	return db.InitializeAccount(ctx, input.Username, input.PasswordHash, input.GitHubID)
}
