-- Anki 记忆卡片：分类 / 卡片库 / 卡片 / 复习事件 / 每日统计 / 每日目标。
-- 所有对象按 user_id 隔离；身份只来自服务端会话，不接受客户端 user_id。

CREATE TABLE anki_categories (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 分类名称在同一用户内按大小写不敏感去重。
CREATE UNIQUE INDEX anki_categories_name ON anki_categories(user_id, lower(name));
CREATE INDEX anki_categories_user ON anki_categories(user_id);

CREATE TABLE anki_decks (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES anki_categories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anki_decks_user ON anki_decks(user_id);
CREATE INDEX anki_decks_category ON anki_decks(category_id);

CREATE TABLE anki_cards (
  id uuid PRIMARY KEY,
  deck_id uuid NOT NULL REFERENCES anki_decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  due_at timestamptz NOT NULL DEFAULT now(),
  interval_days integer NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  ease_factor double precision NOT NULL DEFAULT 2.5,
  review_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 到期队列：按库取 due_at<=now 的卡片。
CREATE INDEX anki_cards_deck_due ON anki_cards(deck_id, due_at);
CREATE INDEX anki_cards_user ON anki_cards(user_id);

-- 复习事件日志：(user_id, mutation_id) 唯一提供幂等重放；
-- 同时用于当日去重卡片数（DISTINCT card_id）与评价次数（COUNT(*)）。
-- card_version 记录提交时客户端持有的版本，作为重放摘要的一部分。
CREATE TABLE anki_reviews (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  card_id uuid NOT NULL,
  card_version integer NOT NULL,
  rating text NOT NULL CHECK (rating IN ('wrong','hard','correct','custom')),
  custom_days integer,
  review_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mutation_id)
);
CREATE INDEX anki_reviews_day ON anki_reviews(user_id, review_date);

-- 每日聚合：reviews 为评价次数，unique_cards 为当日去重卡片数，goal 为当日目标快照。
CREATE TABLE anki_daily_stats (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  reviews integer NOT NULL DEFAULT 0,
  unique_cards integer NOT NULL DEFAULT 0,
  goal integer NOT NULL,
  PRIMARY KEY (user_id, stat_date)
);

-- 每日目标：默认 12，可调 1..500。
CREATE TABLE anki_goals (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  goal integer NOT NULL DEFAULT 12 CHECK (goal BETWEEN 1 AND 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
