-- 申込通知メール取込（Outlook等の受信メールから申込を自動登録）用スキーマ。007実行後に実行。（旧ファイル名 007_mail_ingests.sql。未適用）何度実行しても安全。
-- 取り込んだメールの記録（重複取込の防止・読み取れなかったメールの確認待ち）を保持する。

CREATE TABLE IF NOT EXISTS schedule_mail_ingests (
  id            TEXT PRIMARY KEY,
  source_key    TEXT NOT NULL UNIQUE,      -- webID / 受験番号 / メッセージID から作る重複防止キー
  status        TEXT NOT NULL,             -- 'registered'（登録済） | 'needs_review'（読み取れず確認待ち）
  subject       TEXT NOT NULL DEFAULT '',
  from_address  TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  parsed        JSONB,
  reason        TEXT NOT NULL DEFAULT '',
  student_id    TEXT REFERENCES schedule_students(id),
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_mail_ingests_status_chk CHECK (status IN ('registered','needs_review'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_mail_ingests_status ON schedule_mail_ingests (status, created_at);
ALTER TABLE schedule_mail_ingests ENABLE ROW LEVEL SECURITY;

-- 予約フォームにない入口（全国統一高校生テスト・共通テスト体験受験）。フローは未確定のため仮設定（全て不要）。
INSERT INTO schedule_type_settings (raw_type, test_required, interview_required, trial_applicable, note) VALUES
  ('national_test',      FALSE, FALSE, FALSE, '仮設定。申込者は一般生見込みとして管理'),
  ('common_test_trial',  FALSE, FALSE, FALSE, '仮設定')
ON CONFLICT (raw_type) DO NOTHING;
