-- 账号私有的操作日志；不引用卡片/库外键，编辑、迁库或删除不改写历史。
CREATE TABLE anki_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL,
  mutation_id uuid,
  kind text NOT NULL CHECK (kind IN ('create', 'review')),
  activity_date date NOT NULL,
  occurred_at timestamptz NOT NULL,
  deck_name text,
  category_name text,
  question text,
  rating text CHECK (rating IN ('correct', 'hard', 'wrong', 'custom')),
  custom_days integer,
  historical boolean NOT NULL DEFAULT false,
  CHECK ((kind='create' AND rating IS NULL AND mutation_id IS NULL)
    OR (kind='review' AND rating IS NOT NULL AND mutation_id IS NOT NULL)),
  UNIQUE(user_id, mutation_id)
);
CREATE INDEX anki_activity_day ON anki_activity(user_id, activity_date, occurred_at, id);
CREATE UNIQUE INDEX anki_activity_creation ON anki_activity(user_id, card_id) WHERE kind='create';

-- 旧卡片只有当前内容，不能冒充创建时快照；明确标为历史补入。
INSERT INTO anki_activity(user_id, card_id, kind, activity_date, occurred_at,
  deck_name, category_name, question, historical)
SELECT c.user_id, c.id, 'create', (c.created_at AT TIME ZONE 'Asia/Shanghai')::date,
  c.created_at, d.name, cat.name, c.question, true
FROM anki_cards c
LEFT JOIN anki_decks d ON d.id=c.deck_id AND d.user_id=c.user_id
LEFT JOIN anki_categories cat ON cat.id=d.category_id AND cat.user_id=c.user_id;

-- 每条旧评价原样保留，含重复练习。库归属只用已保存的快照，缺失不推测。
INSERT INTO anki_activity(user_id, card_id, mutation_id, kind, activity_date, occurred_at,
  deck_name, category_name, question, rating, custom_days, historical)
SELECT r.user_id, r.card_id, r.mutation_id, 'review', r.review_date, r.created_at,
  d.name, cat.name, c.question, r.rating, r.custom_days, true
FROM anki_reviews r
LEFT JOIN anki_cards c ON c.id=r.card_id AND c.user_id=r.user_id
LEFT JOIN anki_decks d ON d.id=r.deck_id_snapshot AND d.user_id=r.user_id
LEFT JOIN anki_categories cat ON cat.id=d.category_id AND cat.user_id=r.user_id;
