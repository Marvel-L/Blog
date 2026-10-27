-- 标签目录独立于卡片；同一卡片库内按大小写不敏感唯一。
CREATE TABLE anki_deck_tags (
  id uuid PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES anki_decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX anki_deck_tags_name ON anki_deck_tags(deck_id, lower(name));
CREATE INDEX anki_deck_tags_user ON anki_deck_tags(user_id);

-- 既有标签只迁移一次：大小写变体合并，优先字典序较小的名称（GC 优先于 Gc）。
INSERT INTO anki_deck_tags(id,deck_id,user_id,name)
SELECT md5(deck_id::text || ':' || lower(btrim(tag)))::uuid, deck_id, user_id,
       min(btrim(tag) COLLATE "C")
FROM anki_cards CROSS JOIN LATERAL unnest(tags) AS tag
WHERE btrim(tag) <> ''
GROUP BY deck_id, user_id, lower(btrim(tag));
UPDATE anki_cards c SET tags = ARRAY(
  SELECT t.name FROM anki_deck_tags t
  WHERE t.deck_id=c.deck_id AND t.user_id=c.user_id
    AND EXISTS (SELECT 1 FROM unnest(c.tags) AS old WHERE lower(btrim(old))=lower(t.name))
  ORDER BY t.name COLLATE "C"
) WHERE cardinality(c.tags)>0;
