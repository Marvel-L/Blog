package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrAnkiActivityRange = errors.New("invalid anki activity date or cursor")

type AnkiActivity struct {
	ID           string    `json:"id"`
	Kind         string    `json:"kind"`
	OccurredAt   time.Time `json:"occurredAt"`
	DeckName     string    `json:"deckName"`
	CategoryName string    `json:"categoryName"`
	Question     string    `json:"question"`
	Rating       string    `json:"rating"`
	CustomDays   *int      `json:"customDays"`
	Historical   bool      `json:"historical"`
}

type AnkiActivityPage struct {
	Date       string         `json:"date"`
	Today      string         `json:"today"`
	TimeZone   string         `json:"timeZone"`
	Entries    []AnkiActivity `json:"entries"`
	NextCursor string         `json:"nextCursor"`
}

// insertAnkiActivity 与卡片写入/自评共用事务；只记录成功操作，网络重放不重复写入。
func insertAnkiActivity(ctx context.Context, tx pgx.Tx, userID string, c AnkiCard, kind, mutationID, rating string, customDays *int, at time.Time) error {
	result, err := tx.Exec(ctx, `INSERT INTO anki_activity(user_id,card_id,mutation_id,kind,activity_date,occurred_at,
	 deck_name,category_name,question,rating,custom_days)
	 SELECT $1,$2,NULLIF($3,'')::uuid,$4,$5,$6,d.name,cat.name,$7,NULLIF($8,''),$9
	 FROM anki_decks d JOIN anki_categories cat ON cat.id=d.category_id AND cat.user_id=$1
	 WHERE d.id=$10 AND d.user_id=$1`,
		userID, c.ID, mutationID, kind, ShanghaiDate(at), at, c.Question, rating, customDays, c.DeckID)
	if err == nil && result.RowsAffected() != 1 {
		return ErrAnkiNotFound
	}
	return err
}

// AnkiActivities 不受 dashboard 91 日窗口限制，按真实发生时间逐条返回。
// 分页游标同时限定用户与日期；单页有界，整日复制由客户端加载全部页。
func (s *Store) AnkiActivities(ctx context.Context, userID, date string, cursor int64) (AnkiActivityPage, error) {
	var now time.Time
	if err := s.Pool.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return AnkiActivityPage{}, err
	}
	out := AnkiActivityPage{Date: date, Today: ShanghaiDate(now), TimeZone: "Asia/Shanghai", Entries: []AnkiActivity{}}
	day, err := time.Parse("2006-01-02", date)
	if err != nil || day.Year() < 1 || day.Format("2006-01-02") != date || date > out.Today {
		return out, ErrAnkiActivityRange
	}
	if cursor != 0 {
		var exists bool
		if err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anki_activity
		 WHERE user_id=$1 AND activity_date=$2 AND id=$3)`, userID, date, cursor).Scan(&exists); err != nil {
			return out, err
		}
		if !exists {
			return out, ErrAnkiActivityRange
		}
	}
	const pageSize = 200
	rows, err := s.Pool.Query(ctx, `SELECT id::text,kind,occurred_at,
	 COALESCE(deck_name,'历史卡片库不可用'),COALESCE(category_name,'历史分类不可用'),
	 COALESCE(question,'历史问题不可用'),COALESCE(rating,''),custom_days,historical
	 FROM anki_activity WHERE user_id=$1 AND activity_date=$2
	 AND ($3::bigint=0 OR (occurred_at,id)>(SELECT occurred_at,id FROM anki_activity
	  WHERE user_id=$1 AND activity_date=$2 AND id=$3))
	 ORDER BY anki_activity.occurred_at,anki_activity.id LIMIT $4`, userID, date, cursor, pageSize+1)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var entry AnkiActivity
		if err := rows.Scan(&entry.ID, &entry.Kind, &entry.OccurredAt, &entry.DeckName, &entry.CategoryName,
			&entry.Question, &entry.Rating, &entry.CustomDays, &entry.Historical); err != nil {
			return out, err
		}
		out.Entries = append(out.Entries, entry)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(out.Entries) > pageSize {
		out.NextCursor = out.Entries[pageSize-1].ID
		out.Entries = out.Entries[:pageSize]
	}
	return out, nil
}
