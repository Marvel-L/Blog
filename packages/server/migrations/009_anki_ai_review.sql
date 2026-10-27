-- AI Check 与 anki_reviews 完全分离，不更新卡片排期或练习统计。
CREATE TABLE anki_ai_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 api_key_ciphertext bytea,
 nonce bytea,
 encryption_key_id text NOT NULL DEFAULT 'v1',
 masked_key text NOT NULL DEFAULT '',
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((api_key_ciphertext IS NULL AND nonce IS NULL AND masked_key='') OR (api_key_ciphertext IS NOT NULL AND nonce IS NOT NULL AND octet_length(nonce)=12))
);
CREATE UNIQUE INDEX anki_cards_owner_id ON anki_cards(user_id,id);
CREATE TABLE anki_ai_checks (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 card_id uuid NOT NULL,
 card_version integer NOT NULL CHECK(card_version>0),
 deck_id_snapshot uuid NOT NULL,
 question_snapshot text,
 answer_snapshot text,
 system_prompt_snapshot text,
 user_prompt_snapshot text,
 prompt_version text NOT NULL,
 model_requested text NOT NULL,
 model_returned text,
 key_version bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','unknown','deleted')),
 assistant_content text,
 result jsonb,
 score smallint CHECK(score BETWEEN 0 AND 100),
 usage jsonb,
 error_code text,
 claim_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 started_at timestamptz,
 finished_at timestamptz,
 deleted_at timestamptz,
 FOREIGN KEY(user_id,card_id) REFERENCES anki_cards(user_id,id) ON DELETE CASCADE,
 CHECK ((status='succeeded' AND score IS NOT NULL AND result IS NOT NULL AND assistant_content IS NOT NULL AND assistant_content<>'') OR (status<>'succeeded' AND score IS NULL)),
 CHECK (status='deleted' OR (question_snapshot IS NOT NULL AND answer_snapshot IS NOT NULL AND system_prompt_snapshot IS NOT NULL AND user_prompt_snapshot IS NOT NULL)),
 CHECK (status<>'deleted' OR (question_snapshot IS NULL AND answer_snapshot IS NULL AND system_prompt_snapshot IS NULL AND user_prompt_snapshot IS NULL AND assistant_content IS NULL AND result IS NULL AND usage IS NULL AND error_code IS NULL AND deleted_at IS NOT NULL))
);
CREATE INDEX anki_ai_checks_history ON anki_ai_checks(user_id,card_id,created_at DESC,id DESC);
CREATE INDEX anki_ai_checks_queue ON anki_ai_checks(created_at) WHERE status='queued';
CREATE UNIQUE INDEX anki_ai_checks_active ON anki_ai_checks(user_id,card_id) WHERE status IN ('queued','running');
CREATE TABLE anki_ai_request_receipts (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 mutation_id uuid NOT NULL,
 request_hash text NOT NULL,
 check_id uuid NOT NULL REFERENCES anki_ai_checks(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
 PRIMARY KEY(user_id,mutation_id)
);
CREATE INDEX anki_ai_receipts_check ON anki_ai_request_receipts(check_id);
