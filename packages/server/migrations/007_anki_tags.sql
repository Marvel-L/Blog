-- 标签属于卡片，库内标签由本库卡片聚合；旧卡片默认为无标签，不改变排期或历史。
ALTER TABLE anki_cards ADD COLUMN tags text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(tags) <= 20 AND array_position(tags, NULL) IS NULL);
