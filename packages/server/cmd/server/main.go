package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/aireview"
	"github.com/Marvel-L/Blog/packages/server/internal/config"
	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/Marvel-L/Blog/packages/server/internal/github"
	"github.com/Marvel-L/Blog/packages/server/internal/httpapi"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
	"github.com/Marvel-L/Blog/packages/server/migrations"
)

func main() {
	if run() != nil {
		log.Print("服务操作失败，请检查配置、数据库与迁移（错误详情已隐藏）")
		os.Exit(1)
	}
}
func run() error {
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	switch command {
	case "healthcheck":
		port := os.Getenv("PORT")
		if port == "" {
			port = "3001"
		}
		p, err := strconv.Atoi(port)
		if err != nil || p < 1 || p > 65535 {
			return errors.New("invalid port")
		}
		client := http.Client{Timeout: 3 * time.Second}
		response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/v1/health", p))
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return errors.New("unhealthy")
		}
		return nil
	case "migrate":
		databaseURL := os.Getenv("DATABASE_URL")
		if databaseURL == "" {
			return errors.New("missing database configuration")
		}
		deadline, stop := context.WithTimeout(ctx, 2*time.Minute)
		defer stop()
		if err := migrations.Run(deadline, databaseURL); err != nil {
			return err
		}
		log.Print("数据库迁移完成")
		return nil
	case "serve":
		c, err := config.Load(os.Getenv)
		if err != nil {
			return err
		}
		db, err := store.Open(ctx, c.DatabaseURL)
		if err != nil {
			return err
		}
		defer db.Pool.Close()
		ready, stop := context.WithTimeout(ctx, 15*time.Second)
		err = db.Ready(ready)
		if err == nil {
			err = db.Cleanup(ready)
		}
		stop()
		if err != nil {
			return err
		}
		if c.AIEncryptionKey != "" {
			cipher, cipherErr := deepseek.NewCipher(c.AIEncryptionKey)
			if cipherErr != nil {
				return cipherErr
			}
			if err = db.CleanupAI(ctx); err != nil {
				return err
			}
			workerCtx, workerCancel := context.WithCancel(ctx)
			workerDone := make(chan struct{})
			worker := aireview.Worker{DB: db, Cipher: cipher, KeyID: c.AIEncryptionKeyID, Client: deepseek.NewClient(nil)}
			go func() { defer close(workerDone); worker.Run(workerCtx) }()
			defer func() { workerCancel(); <-workerDone }()
		}
		commitPlanner := github.NewPlannerCommitter(c, nil)
		flushPlanner := func() {
			deadline, done := context.WithTimeout(ctx, 45*time.Second)
			defer done()
			jobs, err := db.PendingPlannerCommits(deadline, 5)
			if err != nil {
				log.Print("月度计划 GitHub 队列读取失败，将在下一周期重试")
				return
			}
			for _, job := range jobs {
				err = commitPlanner(deadline, job.Login, job.Markdown, job.Revision)
				if finishErr := db.FinishPlannerCommit(deadline, job.UserID, job.Revision, err == nil); finishErr != nil {
					log.Print("月度计划 GitHub 队列状态更新失败，将在下一周期重试")
				}
			}
		}
		server := &http.Server{
			Addr:              fmt.Sprintf(":%d", c.Port),
			Handler:           httpapi.New(c, db, github.New(c, nil)),
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      30 * time.Second,
			IdleTimeout:       60 * time.Second,
			MaxHeaderBytes:    16384,
			ErrorLog:          log.New(discard{}, "", 0),
		}
		result := make(chan error, 1)
		go func() { result <- server.ListenAndServe() }()
		queueTick := time.NewTicker(time.Minute)
		defer queueTick.Stop()
		go flushPlanner()
		tick := time.NewTicker(time.Hour)
		defer tick.Stop()
		log.Printf("Go API 已启动，端口 %d", c.Port)
		for {
			select {
			case err := <-result:
				if errors.Is(err, http.ErrServerClosed) {
					return nil
				}
				return err
			case <-ctx.Done():
				deadline, done := context.WithTimeout(context.Background(), 10*time.Second)
				defer done()
				return server.Shutdown(deadline)
			case <-queueTick.C:
				flushPlanner()
			case <-tick.C:
				deadline, done := context.WithTimeout(ctx, 30*time.Second)
				err := db.Cleanup(deadline)
				if err == nil && c.AIEncryptionKey != "" {
					err = db.CleanupAI(deadline)
				}
				done()
				if err != nil {
					log.Print("过期数据清理失败，将在下一周期重试")
				}
			}
		}
	default:
		return errors.New("unknown command")
	}
}

// Suppress net/http's unstructured connection log; it can include user input.
type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }
