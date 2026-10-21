// Package migrations embeds the original numbered SQL; the Go binary needs no source files at runtime.
package migrations

import (
	"context"
	"embed"
	"io/fs"
	"regexp"
	"sort"

	"github.com/jackc/pgx/v5"
)

//go:embed *.sql
var Files embed.FS

func Run(ctx context.Context, databaseURL string) error { return Apply(ctx, databaseURL, Files) }

// Apply holds the same transaction advisory lock and ledger as the previous Node runner.
func Apply(ctx context.Context, databaseURL string, files fs.FS) error {
	c, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer c.Close(context.Background())
	tx, err := c.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	for _, sql := range []string{
		"SET LOCAL statement_timeout = '30s'",
		"SELECT pg_advisory_xact_lock(7102026)",
		"CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
	} {
		if _, err = tx.Exec(ctx, sql); err != nil {
			return err
		}
	}
	entries, err := fs.ReadDir(files, ".")
	if err != nil {
		return err
	}
	names := []string{}
	valid := regexp.MustCompile(`^\d+_[a-z_]+\.sql$`)
	for _, e := range entries {
		if !e.IsDir() && valid.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		var exists bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)", name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, err := fs.ReadFile(files, name)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(name) VALUES ($1)", name); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
