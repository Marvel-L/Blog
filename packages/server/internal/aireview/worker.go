package aireview

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/Marvel-L/Blog/packages/server/internal/deepseek"
	"github.com/Marvel-L/Blog/packages/server/internal/store"
)

type Checker interface {
	Check(context.Context, string, string, string, string) (deepseek.Completion, error)
}
type Worker struct {
	DB     *store.Store
	Cipher *deepseek.Cipher
	KeyID  string
	Client Checker
}

// Run owns all goroutines; cancelling the server context stops IO and polling.
func (w Worker) Run(ctx context.Context) {
	var group sync.WaitGroup
	for i := 0; i < 2; i++ {
		group.Add(1)
		go func() { defer group.Done(); w.loop(ctx) }()
	}
	group.Wait()
}
func (w Worker) loop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			short, cancel := context.WithTimeout(ctx, 10*time.Second)
			job, err := w.DB.ClaimAICheck(short)
			cancel()
			if err != nil || job == nil {
				continue
			}
			w.process(ctx, *job)
		}
	}
}
func (w Worker) process(ctx context.Context, c store.AICheck) {
	finish := func(completion *deepseek.Completion, code string) {
		// Retrying persistence does not make another upstream request.
		for i := 0; i < 3; i++ {
			saveCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := w.DB.FinishAICheck(saveCtx, c, completion, code)
			cancel()
			if err == nil {
				return
			}
			if ctx.Err() != nil {
				return
			}
			timer := time.NewTimer(time.Duration(i+1) * 200 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}
	short, stop := context.WithTimeout(ctx, 10*time.Second)
	key, err := w.DB.AIKey(short, c.UserID)
	stop()
	if err != nil {
		if errors.Is(err, store.ErrAINotConfigured) {
			finish(nil, "AI_KEY_REMOVED")
		} else {
			finish(nil, "AI_STORAGE_UNAVAILABLE")
		}
		return
	}
	if key.Version != c.KeyVersion {
		finish(nil, "AI_KEY_CHANGED")
		return
	}
	if key.KeyID != w.KeyID {
		finish(nil, "AI_KEY_DECRYPT_FAILED")
		return
	}
	plain, err := w.Cipher.Decrypt(c.UserID, key.Version, key.Ciphertext, key.Nonce)
	if err != nil {
		finish(nil, "AI_KEY_DECRYPT_FAILED")
		return
	}
	requestCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	// Deletion is durable; try to cancel running network calls but never promise refunds.
	done := make(chan struct{})
	watchDone := make(chan struct{})
	go func() {
		defer close(watchDone)
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		for {
			select {
			case <-done:
				return
			case <-requestCtx.Done():
				return
			case <-tick.C:
				checkCtx, stop := context.WithTimeout(requestCtx, 3*time.Second)
				active, e := w.DB.AIClaimActive(checkCtx, c)
				stop()
				if e == nil && !active {
					cancel()
					return
				}
			}
		}
	}()
	completion, err := w.Client.Check(requestCtx, plain, c.Model, c.SystemPrompt, c.UserPrompt)
	close(done)
	<-watchDone
	if err != nil {
		code := "AI_REQUEST_UNKNOWN"
		var upstream *deepseek.Error
		if errors.As(err, &upstream) {
			code = upstream.Code
		}
		finish(nil, code)
		return
	}
	finish(&completion, "")
}
