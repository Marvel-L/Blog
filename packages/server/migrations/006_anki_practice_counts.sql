-- 终身练习/结果次数由不可变历史回填；显式重学只重置调度，不清除终身次数。
ALTER TABLE anki_cards
  ADD COLUMN practice_count integer NOT NULL DEFAULT 0,
  ADD COLUMN correct_count integer NOT NULL DEFAULT 0,
  ADD COLUMN hard_count integer NOT NULL DEFAULT 0,
  ADD COLUMN wrong_count integer NOT NULL DEFAULT 0,
  ADD COLUMN custom_count integer NOT NULL DEFAULT 0;

UPDATE anki_cards c SET
  practice_count = r.total,
  correct_count = r.correct,
  hard_count = r.hard,
  wrong_count = r.wrong,
  custom_count = r.custom
FROM (
  SELECT user_id, card_id, count(*)::integer AS total,
    count(*) FILTER (WHERE rating='correct')::integer AS correct,
    count(*) FILTER (WHERE rating='hard')::integer AS hard,
    count(*) FILTER (WHERE rating='wrong')::integer AS wrong,
    count(*) FILTER (WHERE rating='custom')::integer AS custom
  FROM anki_reviews GROUP BY user_id, card_id
) r WHERE c.id=r.card_id AND c.user_id=r.user_id;

-- 主动练习与到期练习共享调度，但来源必须纳入幂等摘要，不能跨入口重放。
ALTER TABLE anki_reviews ADD COLUMN review_mode text NOT NULL DEFAULT 'due'
  CHECK (review_mode IN ('due', 'practice'));
CREATE INDEX anki_reviews_card_results ON anki_reviews(user_id, card_id, rating);
