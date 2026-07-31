-- 東進ハイスクール春日部校 予約ページ（学力診断テスト・初回三者面談）用スキーマ
-- Work With OS と同じ Supabase プロジェクトに、衝突回避のため schedule_ プレフィックスで追加する。
-- Supabaseダッシュボードの「SQL Editor」に貼り付けて実行してください。
--
-- セキュリティ方針：一般公開ページ（匿名アクセス）から直接テーブルを触らせない。
-- RLS は有効化するが許可ポリシーは追加しない＝anon/authenticatedキーからは読み書き不可。
-- このアプリのAPI Route（サーバー側、SUPABASE_SERVICE_ROLE_KEY使用）のみが読み書きする（Service RoleはRLSをバイパスする）。

CREATE TABLE IF NOT EXISTS schedule_applications (
  id                        TEXT PRIMARY KEY,
  pattern                   TEXT NOT NULL,       -- 'A' | 'B' | 'C'
  raw_type                  TEXT NOT NULL,        -- 申込種別（Googleフォームの値）
  name                      TEXT NOT NULL,
  school                    TEXT NOT NULL,
  grade                     TEXT NOT NULL,
  email                     TEXT NOT NULL,
  phone                     TEXT NOT NULL,
  relation                  TEXT NOT NULL,        -- 'self' | 'parent' | 'other'
  grade_group               TEXT,                 -- 'g3' | 'g12' | null（パターンAはnull）
  arrival_constraint_note   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_hearing_answers (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES schedule_applications(id),
  item1           TEXT NOT NULL DEFAULT '',
  item2           TEXT NOT NULL DEFAULT '',
  item3           TEXT NOT NULL DEFAULT '',
  item4           TEXT NOT NULL DEFAULT '',
  item5           TEXT NOT NULL DEFAULT '',
  item6           TEXT NOT NULL DEFAULT '',
  item7           TEXT NOT NULL DEFAULT '',
  item8           TEXT NOT NULL DEFAULT '',
  item9           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS schedule_pattern_a_answers (
  id                      TEXT PRIMARY KEY,
  application_id          TEXT NOT NULL REFERENCES schedule_applications(id),
  kanji_name              TEXT NOT NULL DEFAULT '',
  kana_name               TEXT NOT NULL DEFAULT '',
  current_path_hope       TEXT NOT NULL DEFAULT '',
  desired_university      TEXT NOT NULL DEFAULT '',
  desired_faculty         TEXT NOT NULL DEFAULT '',
  referrer_student_name   TEXT NOT NULL DEFAULT '',
  contact_phone           TEXT NOT NULL DEFAULT '',
  bring_friend            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS schedule_test_subject_selections (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES schedule_applications(id),
  subject_key     TEXT NOT NULL,
  subject_order   INTEGER NOT NULL   -- 選択順＝複数日分割の充填順
);

CREATE TABLE IF NOT EXISTS schedule_appointments (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES schedule_applications(id),
  kind            TEXT NOT NULL,     -- 'test' | 'interview'
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  day_index       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedule_tokens (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES schedule_applications(id),
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ
);

-- 星野（校舎長）カレンダーの busy 区間。初回三者面談の空き枠検出にのみ使用。
CREATE TABLE IF NOT EXISTS schedule_busy_blocks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  label       TEXT NOT NULL DEFAULT ''
);

ALTER TABLE schedule_applications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_hearing_answers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_pattern_a_answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_test_subject_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_appointments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tokens                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_busy_blocks             ENABLE ROW LEVEL SECURITY;
-- ポリシーは意図的に追加しない（anon/authenticatedは常に拒否、service_roleのみアクセス可）
