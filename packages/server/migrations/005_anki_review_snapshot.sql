-- 从此版本起，每次评价保留发生时的卡片库归属；迁库不改历史。
-- 旧日志没有库快照，不推测回填，以 NULL 明确表示历史来源未知。
ALTER TABLE anki_reviews ADD COLUMN deck_id_snapshot uuid;
CREATE INDEX anki_reviews_deck_day ON anki_reviews(user_id, deck_id_snapshot, review_date);
