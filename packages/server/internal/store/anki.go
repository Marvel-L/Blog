package store

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// Anki 相关的领域错误。HTTP 层据此映射状态码。
var (
	ErrAnkiNotFound      = errors.New("anki object not found")
	ErrAnkiVersion       = errors.New("anki card version conflict")
	ErrAnkiNotDue        = errors.New("anki card is not due yet")
	ErrAnkiDuplicateName = errors.New("anki category name already exists")
)

// 上海时区：日统计与自然日边界一律以 Asia/Shanghai 为准，客户端时钟不参与调度。
var shanghai = mustShanghai()

func mustShanghai() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*60*60)
	}
	return loc
}

// ShanghaiDate 返回某 UTC 时刻对应的上海自然日（YYYY-MM-DD）。
func ShanghaiDate(now time.Time) string {
	return now.In(shanghai).Format("2006-01-02")
}

type AnkiCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type AnkiDeck struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Name       string `json:"name"`
}
type AnkiDeckStats struct {
	AnkiDeck
	Total   int `json:"total"`
	Learned int `json:"learned"`
	Stable  int `json:"stable"`
	Due     int `json:"due"`
}
type AnkiCard struct {
	ID           string    `json:"id"`
	DeckID       string    `json:"deckId"`
	Question     string    `json:"question"`
	Answer       string    `json:"answer"`
	DueAt        time.Time `json:"dueAt"`
	IntervalDays int       `json:"intervalDays"`
	Repetitions  int       `json:"repetitions"`
	EaseFactor   float64   `json:"easeFactor"`
	ReviewCount  int       `json:"reviewCount"`
	Version      int       `json:"version"`
}
type AnkiHistoryDay struct {
	Date        string `json:"date"`
	UniqueCards int    `json:"uniqueCards"`
	Reviews     int    `json:"reviews"`
	Goal        int    `json:"goal"`
}
type AnkiDashboard struct {
	Categories []AnkiCategory   `json:"categories"`
	Decks      []AnkiDeckStats  `json:"decks"`
	Goal       int              `json:"goal"`
	Today      string           `json:"today"`
	TimeZone   string           `json:"timeZone"`
	History    []AnkiHistoryDay `json:"history"`
}

const (
	AnkiDefaultGoal   = 12
	AnkiStableDays    = 21  // 熟练阈值：间隔 >=21 天仅为排期状态，非掌握证明。
	ankiAgainMinutes  = 10  // “错误”后 10 分钟重学（学习步，与 SM-2 间隔分开）。
	ankiMinEaseFactor = 1.3 // SM-2 EF 下限，无上限。
)

// schedule 是服务端权威的简化调度结果（非完整 FSRS）。
type schedule struct {
	intervalDays int
	repetitions  int
	easeFactor   float64
	dueAt        time.Time
}

// Schedule 纯函数：服务端权威的 SM-2 复算（SuperMemo 2，非 FSRS）。
// rating ∈ wrong|hard|correct，映射为质量 q：wrong=1、hard=3、correct=5。
// customDays 非 nil 时为独立分支，与 rating 互斥：不更新 EF、不改变 repetitions（中性），仅设定间隔。
func nextSchedule(intervalDays, repetitions int, easeFactor float64, rating string, customDays *int, now time.Time) schedule {
	if customDays != nil {
		return schedule{
			intervalDays: *customDays,
			repetitions:  repetitions, // 既不视为正确也不视为错误：连击不变。
			easeFactor:   easeFactor,  // 明确不更新 EF。
			dueAt:        now.AddDate(0, 0, *customDays),
		}
	}
	q := 1
	if rating == "hard" {
		q = 3
	} else if rating == "correct" {
		q = 5
	}
	// 标准 SM-2 EF 公式：EF' = EF + 0.1 - (5-q)*(0.08+(5-q)*0.02)，下限 1.3，无上限。
	ef := easeFactor + (0.1 - float64(5-q)*(0.08+float64(5-q)*0.02))
	if ef < ankiMinEaseFactor {
		ef = ankiMinEaseFactor
	}
	if q < 3 {
		// 失败：重置连续成功次数并重学；10 分钟为学习步，与 SM-2 间隔分开。
		return schedule{intervalDays: 0, repetitions: 0, easeFactor: ef, dueAt: now.Add(ankiAgainMinutes * time.Minute)}
	}
	// 成功（q>=3）：连续次数 1→1 天，2→6 天，其后 ceil(旧间隔×旧EF)（用本次评分前的 EF）。
	// 官方 SM-2 用向上取整 ceil（super-memory.com/english/ol/sm2.htm）。
	nextReps := repetitions + 1
	interval := 0
	switch {
	case nextReps == 1:
		interval = 1
	case nextReps == 2:
		interval = 6
	default:
		interval = int(math.Ceil(float64(intervalDays) * easeFactor))
	}
	return schedule{intervalDays: interval, repetitions: nextReps, easeFactor: ef, dueAt: now.AddDate(0, 0, interval)}
}

// previewInterval 是 q>=3 成功时“本次评分后”的间隔预览（与 hard/correct 无关，仅依赖状态与旧 EF）。
func previewInterval(intervalDays, repetitions int, easeFactor float64) int {
	nextReps := repetitions + 1
	switch {
	case nextReps == 1:
		return 1
	case nextReps == 2:
		return 6
	default:
		return int(math.Ceil(float64(intervalDays) * easeFactor))
	}
}

// effRating 把传入评价折算为落库的 rating 枚举（自定义天数独立记为 custom）。
func effRating(rating string, customDays *int) string {
	if customDays != nil {
		return "custom"
	}
	return rating
}

// Previews 返回某卡若在此时被评价为 hard/correct 时的间隔预览（天）；wrong 固定 10 分钟。
// SM-2 中 q>=3 的本次间隔只依赖连续次数/旧间隔/旧 EF，与 hard/correct 无关，故两者相同。
// 仅用于前端“评分前可选显示下次间隔”，不强制揭示、不影响排期。
func Previews(intervalDays, repetitions int, easeFactor float64) (days int) {
	return previewInterval(intervalDays, repetitions, easeFactor)
}

func scanCard(row pgx.Row) (AnkiCard, error) {
	var c AnkiCard
	err := row.Scan(&c.ID, &c.DeckID, &c.Question, &c.Answer, &c.DueAt, &c.IntervalDays, &c.Repetitions, &c.EaseFactor, &c.ReviewCount, &c.Version)
	return c, err
}

const ankiCardColumns = `id::text, deck_id::text, question, answer, due_at, interval_days, repetitions, ease_factor, review_count, version`

func (s *Store) CreateAnkiCategory(ctx context.Context, userID, name string) (AnkiCategory, error) {
	var c AnkiCategory
	err := s.Pool.QueryRow(ctx, `INSERT INTO anki_categories(id,user_id,name) VALUES($1,$2,$3)
	 ON CONFLICT(user_id, lower(name)) DO NOTHING RETURNING id::text,name`, uuid(), userID, name).Scan(&c.ID, &c.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiCategory{}, ErrAnkiDuplicateName
	}
	if err != nil {
		return AnkiCategory{}, err
	}
	return c, nil
}

func (s *Store) CreateAnkiDeck(ctx context.Context, userID, categoryID, name string) (AnkiDeck, error) {
	var d AnkiDeck
	err := s.Pool.QueryRow(ctx, `INSERT INTO anki_decks(id,category_id,user_id,name)
	 SELECT $1,id,$2,$3 FROM anki_categories WHERE id=$4 AND user_id=$2 RETURNING id::text,category_id::text,name`,
		uuid(), userID, name, categoryID).Scan(&d.ID, &d.CategoryID, &d.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiDeck{}, ErrAnkiNotFound
	}
	if err != nil {
		return AnkiDeck{}, err
	}
	return d, nil
}

// ListAnkiCards 返回库内全部卡片（含答案；编辑器/列表用，非练习队列）。
func (s *Store) ListAnkiCards(ctx context.Context, userID, deckID string) ([]AnkiCard, error) {
	var ok string
	if err := s.Pool.QueryRow(ctx, "SELECT id::text FROM anki_decks WHERE id=$1 AND user_id=$2", deckID, userID).Scan(&ok); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAnkiNotFound
		}
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT `+ankiCardColumns+` FROM anki_cards WHERE deck_id=$1 AND user_id=$2 ORDER BY created_at,id`, deckID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []AnkiCard{}
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (s *Store) CreateAnkiCard(ctx context.Context, userID, deckID, question, answer string) (AnkiCard, error) {
	var c AnkiCard
	err := s.Pool.QueryRow(ctx, `INSERT INTO anki_cards(id,deck_id,user_id,question,answer)
	 SELECT $1,$2,$3,$4,$5 FROM anki_decks WHERE id=$2 AND user_id=$3 RETURNING `+ankiCardColumns,
		uuid(), deckID, userID, question, answer).Scan(scanCardScans(&c)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiCard{}, ErrAnkiNotFound
	}
	if err != nil {
		return AnkiCard{}, err
	}
	return c, nil
}

// UpdateAnkiCard 编辑问答（保留进度，复习历史不删除）；resetProgress 时把排期重置为新卡。
func (s *Store) UpdateAnkiCard(ctx context.Context, userID, cardID, deckID, question, answer string, resetProgress bool, version int) (AnkiCard, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AnkiCard{}, err
	}
	defer tx.Rollback(context.Background())
	var current int
	err = tx.QueryRow(ctx, "SELECT version FROM anki_cards WHERE id=$1 AND user_id=$2 FOR UPDATE", cardID, userID).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiCard{}, ErrAnkiNotFound
	}
	if err != nil {
		return AnkiCard{}, err
	}
	if current != version {
		return AnkiCard{}, ErrAnkiVersion
	}
	if deckID != "" {
		var owned string
		err = tx.QueryRow(ctx, "SELECT id::text FROM anki_decks WHERE id=$1 AND user_id=$2 FOR SHARE", deckID, userID).Scan(&owned)
		if errors.Is(err, pgx.ErrNoRows) {
			return AnkiCard{}, ErrAnkiNotFound
		}
		if err != nil {
			return AnkiCard{}, err
		}
	}
	resetSQL := ", interval_days=0,repetitions=0,ease_factor=2.5,review_count=0,due_at=now()"
	if !resetProgress {
		resetSQL = ""
	}
	var c AnkiCard
	err = tx.QueryRow(ctx, `UPDATE anki_cards SET question=$3,answer=$4,version=version+1,
	 deck_id=COALESCE(NULLIF($5,'')::uuid,deck_id)`+resetSQL+`
	 WHERE id=$1 AND user_id=$2 RETURNING `+ankiCardColumns, cardID, userID, question, answer, deckID).Scan(scanCardScans(&c)...)
	if err != nil {
		return AnkiCard{}, err
	}
	return c, tx.Commit(ctx)
}

// AnkiQueue 返回该库中当前到期的学习队列（review 卡先于新卡），并返回 DB 时钟作为 serverNow。
func (s *Store) AnkiQueue(ctx context.Context, userID, deckID string) ([]AnkiCard, time.Time, error) {
	var ok string
	if err := s.Pool.QueryRow(ctx, "SELECT id::text FROM anki_decks WHERE id=$1 AND user_id=$2", deckID, userID).Scan(&ok); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, time.Time{}, ErrAnkiNotFound
		}
		return nil, time.Time{}, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT `+ankiCardColumns+` FROM anki_cards
	 WHERE deck_id=$1 AND user_id=$2 AND due_at<=clock_timestamp()
	 ORDER BY (review_count=0), due_at, created_at, id`, deckID, userID)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer rows.Close()
	result := []AnkiCard{}
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, time.Time{}, err
		}
		result = append(result, c)
	}
	if err = rows.Err(); err != nil {
		return nil, time.Time{}, err
	}
	var serverNow time.Time
	if err = s.Pool.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&serverNow); err != nil {
		return nil, time.Time{}, err
	}
	return result, serverNow, nil
}

// ReviewAnkiCard 在单事务内完成幂等评价：记录复习事件 + 卡片复算排期 + 当日聚合。
// 同 mutationId 同 payload（同卡/同提交版本/同评级/同自定义天数）重放直接返回当前卡片；
// 异 payload（含跨卡复用 mutationId、同卡异提交版本）返回 ErrMutationReuse。
// 调度/日桶时间一律取锁后的 DB clock_timestamp()，避免应用时钟漂移与跨锁等待。
func (s *Store) ReviewAnkiCard(ctx context.Context, userID, cardID string, version int, mutationID, rating string, customDays *int) (AnkiCard, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AnkiCard{}, err
	}
	defer tx.Rollback(context.Background())
	// 序列化该用户的 Anki 写操作，抵御多标签页并发评价。
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&locked); err != nil {
		return AnkiCard{}, err
	}
	var c AnkiCard
	err = tx.QueryRow(ctx, `SELECT `+ankiCardColumns+` FROM anki_cards WHERE id=$1 AND user_id=$2 FOR UPDATE`, cardID, userID).Scan(scanCardScans(&c)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiCard{}, ErrAnkiNotFound
	}
	if err != nil {
		return AnkiCard{}, err
	}
	// 锁后取 DB 真实时钟（clock_timestamp 反映锁等待后的当前时刻，不用事务开始锚定的 now()）。
	var dbNow time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&dbNow); err != nil {
		return AnkiCard{}, err
	}
	// 幂等优先：同 mutationId 的重放必须先于版本校验识别（客户端重发原 payload/version）。
	var priorCard string
	var priorVersion int
	var priorRating string
	var priorCustom *int
	err = tx.QueryRow(ctx, "SELECT card_id::text,card_version,rating,custom_days FROM anki_reviews WHERE user_id=$1 AND mutation_id=$2", userID, mutationID).Scan(&priorCard, &priorVersion, &priorRating, &priorCustom)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return AnkiCard{}, err
	}
	replayed := errors.Is(err, pgx.ErrNoRows) == false
	if replayed {
		same := priorCard == cardID && priorVersion == version && priorRating == effRating(rating, customDays) &&
			((priorCustom == nil && customDays == nil) || (priorCustom != nil && customDays != nil && *priorCustom == *customDays))
		if !same {
			return AnkiCard{}, ErrMutationReuse
		}
		// 同 payload 重放：直接返回当前卡片，不重复推进/计数。
		return c, tx.Commit(ctx)
	}
	// 未到期守卫：合法重放已在上面放行；新评价必须 c.DueAt<=dbNow，拒绝提前自评（含伪造直接请求）。
	if c.DueAt.After(dbNow) {
		return AnkiCard{}, ErrAnkiNotDue
	}
	if c.Version != version {
		return AnkiCard{}, ErrAnkiVersion
	}
	effRating := rating
	if customDays != nil {
		effRating = "custom"
	}
	sched := nextSchedule(c.IntervalDays, c.Repetitions, c.EaseFactor, rating, customDays, dbNow)
	today := ShanghaiDate(dbNow)
	// 当日是否已评价过此卡（去重 uniqueCards）。
	var already bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM anki_reviews WHERE user_id=$1 AND card_id=$2 AND review_date=$3)", userID, cardID, today).Scan(&already); err != nil {
		return AnkiCard{}, err
	}
	delta := 1
	if already {
		delta = 0
	}
	var goal int
	if err = tx.QueryRow(ctx, "SELECT goal FROM anki_goals WHERE user_id=$1", userID).Scan(&goal); err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return AnkiCard{}, err
		}
		goal = AnkiDefaultGoal
	}
	err = tx.QueryRow(ctx, `UPDATE anki_cards SET due_at=$3,interval_days=$4,repetitions=$5,ease_factor=$6,review_count=review_count+1,version=version+1
	 WHERE id=$1 AND user_id=$2 RETURNING `+ankiCardColumns,
		cardID, userID, sched.dueAt, sched.intervalDays, sched.repetitions, sched.easeFactor).Scan(scanCardScans(&c)...)
	if err != nil {
		return AnkiCard{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO anki_reviews(user_id,mutation_id,card_id,card_version,rating,custom_days,review_date,deck_id_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		userID, mutationID, cardID, version, effRating, customDays, today, c.DeckID); err != nil {
		return AnkiCard{}, err
	}
	// 当日聚合：reviews 恒 +1；unique_cards 仅在当日首次评价此卡时 +1；goal 仅在新建日行快照。
	if _, err = tx.Exec(ctx, `INSERT INTO anki_daily_stats(user_id,stat_date,reviews,unique_cards,goal)
	 VALUES($1,$2,1,$3,$4)
	 ON CONFLICT(user_id,stat_date) DO UPDATE SET reviews=anki_daily_stats.reviews+1,
	 unique_cards=anki_daily_stats.unique_cards+EXCLUDED.unique_cards`, userID, today, delta, goal); err != nil {
		return AnkiCard{}, err
	}
	return c, tx.Commit(ctx)
}

func (s *Store) AnkiGoal(ctx context.Context, userID string) (int, error) {
	var goal int
	err := s.Pool.QueryRow(ctx, "SELECT goal FROM anki_goals WHERE user_id=$1", userID).Scan(&goal)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiDefaultGoal, nil
	}
	return goal, err
}

func (s *Store) SetAnkiGoal(ctx context.Context, userID string, goal int) (int, error) {
	err := s.Pool.QueryRow(ctx, `INSERT INTO anki_goals(user_id,goal) VALUES($1,$2)
	 ON CONFLICT(user_id) DO UPDATE SET goal=EXCLUDED.goal,updated_at=now() RETURNING goal`, userID, goal).Scan(&goal)
	return goal, err
}

func (s *Store) AnkiDashboard(ctx context.Context, userID string, historyDays int) (AnkiDashboard, error) {
	// 用 DB 时钟统一 due 判定与自然日边界，避免应用时钟漂移。
	var dbNow time.Time
	if err := s.Pool.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&dbNow); err != nil {
		return AnkiDashboard{}, err
	}
	out := AnkiDashboard{TimeZone: "Asia/Shanghai", Today: ShanghaiDate(dbNow)}
	rows, err := s.Pool.Query(ctx, "SELECT id::text,name FROM anki_categories WHERE user_id=$1 ORDER BY created_at,id", userID)
	if err != nil {
		return out, err
	}
	out.Categories = []AnkiCategory{}
	for rows.Next() {
		var c AnkiCategory
		if err = rows.Scan(&c.ID, &c.Name); err != nil {
			rows.Close()
			return out, err
		}
		out.Categories = append(out.Categories, c)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	rows, err = s.Pool.Query(ctx, `SELECT d.id::text,d.category_id::text,d.name,
	 COUNT(c.id),
	 COUNT(c.id) FILTER (WHERE c.review_count>0),
	 COUNT(c.id) FILTER (WHERE c.interval_days>= $2),
	 COUNT(c.id) FILTER (WHERE c.due_at<= clock_timestamp())
	 FROM anki_decks d LEFT JOIN anki_cards c ON c.deck_id=d.id
	 WHERE d.user_id=$1 GROUP BY d.id ORDER BY d.created_at,d.id`, userID, AnkiStableDays)
	if err != nil {
		return out, err
	}
	out.Decks = []AnkiDeckStats{}
	for rows.Next() {
		var d AnkiDeckStats
		if err = rows.Scan(&d.ID, &d.CategoryID, &d.Name, &d.Total, &d.Learned, &d.Stable, &d.Due); err != nil {
			rows.Close()
			return out, err
		}
		out.Decks = append(out.Decks, d)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	if out.Goal, err = s.AnkiGoal(ctx, userID); err != nil {
		return out, err
	}
	// 历史：拉取窗口内有记录的日子，再补齐连续自然日（含零起步）。
	type dayRow struct{ reviews, unique, goal int }
	seen := map[string]dayRow{}
	rows, err = s.Pool.Query(ctx, `SELECT stat_date::text,reviews,unique_cards,goal FROM anki_daily_stats
	 WHERE user_id=$1 AND stat_date>= $2`, userID, dbNow.In(shanghai).AddDate(0, 0, -(historyDays-1)).Format("2006-01-02"))
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var k string
		var r dayRow
		if err = rows.Scan(&k, &r.reviews, &r.unique, &r.goal); err != nil {
			rows.Close()
			return out, err
		}
		seen[k] = r
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	out.History = make([]AnkiHistoryDay, 0, historyDays)
	base := dbNow.In(shanghai).AddDate(0, 0, -(historyDays - 1))
	for i := 0; i < historyDays; i++ {
		day := base.AddDate(0, 0, i).Format("2006-01-02")
		r := seen[day]
		out.History = append(out.History, AnkiHistoryDay{Date: day, UniqueCards: r.unique, Reviews: r.reviews, Goal: r.goal})
	}
	return out, nil
}

// scanCardScans 返回按 ankiCardColumns 顺序的扫描目标（便于 QueryRow/Scan 复用）。
func scanCardScans(c *AnkiCard) []any {
	return []any{&c.ID, &c.DeckID, &c.Question, &c.Answer, &c.DueAt, &c.IntervalDays, &c.Repetitions, &c.EaseFactor, &c.ReviewCount, &c.Version}
}
