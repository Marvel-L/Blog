package store

import (
	"math"
	"testing"
	"time"
)

func ptr(v int) *int { return &v }

func TestSM2CorrectSequence(t *testing.T) {
	now := time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC)
	// 从新卡（interval=0, reps=0, EF=2.5）连续 correct(q=5) 的标准 SM-2 序列。
	interval, reps, ef := 0, 0, 2.5
	want := []struct {
		interval, reps int
		ef             float64
	}{
		{1, 1, 2.6},  // 第 1 次成功：1 天，EF+0.1
		{6, 2, 2.7},  // 第 2 次成功：6 天
		{17, 3, 2.8}, // 第 3 次：ceil(6*2.7)=17（用评分前 EF）
		{48, 4, 2.9}, // 第 4 次：ceil(17*2.8)=48
	}
	for i, w := range want {
		got := nextSchedule(interval, reps, ef, "correct", nil, now)
		if got.intervalDays != w.interval || got.repetitions != w.reps || math.Abs(got.easeFactor-w.ef) > 1e-9 {
			t.Fatalf("step %d: got interval=%d reps=%d ef=%v want %d/%d/%v", i+1, got.intervalDays, got.repetitions, got.easeFactor, w.interval, w.reps, w.ef)
		}
		if got.dueAt.Sub(now) != time.Duration(w.interval)*24*time.Hour {
			t.Fatalf("step %d due=%v want +%dd", i+1, got.dueAt.Sub(now), w.interval)
		}
		interval, reps, ef = got.intervalDays, got.repetitions, got.easeFactor
	}
}

func TestSM2HardEFDecreases(t *testing.T) {
	now := time.Now()
	// EF=2.5, hard(q=3)：delta=0.1-(2)*(0.08+2*0.02)=-0.14 → 2.36；成功且间隔按旧 EF 复算。
	got := nextSchedule(6, 2, 2.5, "hard", nil, now)
	if math.Abs(got.easeFactor-2.36) > 1e-9 {
		t.Fatalf("hard ef=%v want 2.36", got.easeFactor)
	}
	if got.repetitions != 3 || got.intervalDays != 15 { // ceil(6*2.5)=15（用评分前 EF）
		t.Fatalf("hard state=%+v", got)
	}
}

func TestSM2WrongLapseAndEFloor(t *testing.T) {
	now := time.Now()
	// wrong(q=1)：重置 reps=0、interval=0，EF delta=0.1-4*0.16=-0.54 → 2.9-0.54=2.36，due 10 分钟。
	got := nextSchedule(43, 4, 2.9, "wrong", nil, now)
	if got.repetitions != 0 || got.intervalDays != 0 || math.Abs(got.easeFactor-2.36) > 1e-9 {
		t.Fatalf("wrong lapse=%+v", got)
	}
	if got.dueAt.Sub(now) > 15*time.Minute || got.dueAt.Sub(now) < 5*time.Minute {
		t.Fatalf("wrong should be ~10min relearn step, got %v", got.dueAt.Sub(now))
	}
	// EF 下限 1.3，不再下降。
	got = nextSchedule(0, 0, 1.3, "wrong", nil, now)
	if got.easeFactor != 1.3 {
		t.Fatalf("ef floor=%v want 1.3", got.easeFactor)
	}
}

func TestSM2CustomNeutral(t *testing.T) {
	now := time.Now()
	// 自定义独立分支：EF/reps 不变，仅设定间隔。
	got := nextSchedule(43, 4, 2.9, "", ptr(15), now)
	if got.intervalDays != 15 || got.repetitions != 4 || got.easeFactor != 2.9 {
		t.Fatalf("custom=%+v", got)
	}
	if got.dueAt.Sub(now) != 15*24*time.Hour {
		t.Fatalf("custom due=%v", got.dueAt.Sub(now))
	}
}

func TestPreviewsMatchActual(t *testing.T) {
	// 预览与实际 q>=3 复算一致。
	if d := Previews(6, 2, 2.5); d != 15 { // round(6*2.5)
		t.Fatalf("preview mid=%d want 15", d)
	}
	if d := Previews(0, 0, 2.5); d != 1 { // 首次成功 1 天
		t.Fatalf("preview fresh=%d want 1", d)
	}
}

func TestShanghaiDate(t *testing.T) {
	// UTC 2026-10-26 16:30 -> Shanghai 2026-10-27 00:30，应落到 27 日。
	utc := time.Date(2026, 10, 26, 16, 30, 0, 0, time.UTC)
	if got := ShanghaiDate(utc); got != "2026-10-27" {
		t.Fatalf("ShanghaiDate=%s want 2026-10-27", got)
	}
}
