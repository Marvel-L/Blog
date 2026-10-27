package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

var ErrAnkiUnknownTag = errors.New("anki tag is not in this deck")
var ErrAnkiDuplicateTag = errors.New("anki tag name already exists")

type AnkiTag struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CardCount int    `json:"cardCount"`
}

// 所有标签/卡片写操作先锁用户，与评价入口顺序一致，防止删除标签与保存卡片互相覆盖。
func lockAnkiUser(ctx context.Context, tx pgx.Tx, userID string) error {
	var id string
	err := tx.QueryRow(ctx, "SELECT id::text FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAnkiNotFound
	}
	return err
}
func ownAnkiDeck(ctx context.Context, tx pgx.Tx, userID, deckID string) error {
	var id string
	err := tx.QueryRow(ctx, "SELECT id::text FROM anki_decks WHERE id=$1 AND user_id=$2", deckID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAnkiNotFound
	}
	return err
}

// 只选择目录已有标签，采用目录原名；不允许卡片保存顺便创建标签。
func canonicalAnkiTags(ctx context.Context, tx pgx.Tx, userID, deckID string, names []string) ([]string, error) {
	out := []string{}
	seen := map[string]bool{}
	for _, name := range names {
		var canonical string
		err := tx.QueryRow(ctx, `SELECT name FROM anki_deck_tags WHERE user_id=$1 AND deck_id=$2 AND lower(name)=lower($3)`, userID, deckID, strings.TrimSpace(name)).Scan(&canonical)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAnkiUnknownTag
		}
		if err != nil {
			return nil, err
		}
		key := strings.ToLower(canonical)
		if !seen[key] {
			out = append(out, canonical)
			seen[key] = true
		}
	}
	return out, nil
}

func (s *Store) ListAnkiTags(ctx context.Context, userID, deckID string) ([]AnkiTag, error) {
	var id string
	err := s.Pool.QueryRow(ctx, "SELECT id::text FROM anki_decks WHERE id=$1 AND user_id=$2", deckID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAnkiNotFound
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT t.id::text,t.name,(SELECT count(*) FROM anki_cards c WHERE c.user_id=t.user_id AND c.deck_id=t.deck_id AND t.name=ANY(c.tags)) FROM anki_deck_tags t WHERE t.user_id=$1 AND t.deck_id=$2 ORDER BY t.created_at,t.name,t.id`, userID, deckID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AnkiTag{}
	for rows.Next() {
		var tag AnkiTag
		if err = rows.Scan(&tag.ID, &tag.Name, &tag.CardCount); err != nil {
			return nil, err
		}
		out = append(out, tag)
	}
	return out, rows.Err()
}
func (s *Store) CreateAnkiTag(ctx context.Context, userID, deckID, name string) (AnkiTag, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AnkiTag{}, err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, userID); err != nil {
		return AnkiTag{}, err
	}
	if err = ownAnkiDeck(ctx, tx, userID, deckID); err != nil {
		return AnkiTag{}, err
	}
	var tag AnkiTag
	err = tx.QueryRow(ctx, `INSERT INTO anki_deck_tags(id,user_id,deck_id,name) VALUES($1,$2,$3,$4) ON CONFLICT(deck_id,lower(name)) DO NOTHING RETURNING id::text,name`, uuid(), userID, deckID, name).Scan(&tag.ID, &tag.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiTag{}, ErrAnkiDuplicateTag
	}
	if err != nil {
		return AnkiTag{}, err
	}
	return tag, tx.Commit(ctx)
}
func (s *Store) RenameAnkiTag(ctx context.Context, userID, deckID, tagID, name string) (AnkiTag, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return AnkiTag{}, err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, userID); err != nil {
		return AnkiTag{}, err
	}
	var old string
	err = tx.QueryRow(ctx, `SELECT name FROM anki_deck_tags WHERE id=$1 AND user_id=$2 AND deck_id=$3 FOR UPDATE`, tagID, userID, deckID).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnkiTag{}, ErrAnkiNotFound
	}
	if err != nil {
		return AnkiTag{}, err
	}
	var duplicate bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM anki_deck_tags WHERE user_id=$1 AND deck_id=$2 AND lower(name)=lower($3) AND id<>$4)`, userID, deckID, name, tagID).Scan(&duplicate); err != nil {
		return AnkiTag{}, err
	}
	if duplicate {
		return AnkiTag{}, ErrAnkiDuplicateTag
	}
	if _, err = tx.Exec(ctx, `UPDATE anki_deck_tags SET name=$2 WHERE id=$1`, tagID, name); err != nil {
		return AnkiTag{}, err
	}
	result, err := tx.Exec(ctx, `UPDATE anki_cards SET tags=array_replace(tags,$3,$4),version=version+1 WHERE user_id=$1 AND deck_id=$2 AND $3=ANY(tags) AND $3<>$4`, userID, deckID, old, name)
	if err != nil {
		return AnkiTag{}, err
	}
	count := int(result.RowsAffected())
	if old == name {
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM anki_cards WHERE user_id=$1 AND deck_id=$2 AND $3=ANY(tags)`, userID, deckID, name).Scan(&count); err != nil {
			return AnkiTag{}, err
		}
	}
	return AnkiTag{ID: tagID, Name: name, CardCount: count}, tx.Commit(ctx)
}
func (s *Store) DeleteAnkiTag(ctx context.Context, userID, deckID, tagID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if err = lockAnkiUser(ctx, tx, userID); err != nil {
		return err
	}
	var name string
	err = tx.QueryRow(ctx, `DELETE FROM anki_deck_tags WHERE id=$1 AND user_id=$2 AND deck_id=$3 RETURNING name`, tagID, userID, deckID).Scan(&name)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAnkiNotFound
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE anki_cards SET tags=array_remove(tags,$3),version=version+1 WHERE user_id=$1 AND deck_id=$2 AND $3=ANY(tags)`, userID, deckID, name); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
