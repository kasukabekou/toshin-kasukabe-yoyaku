-- 管理プラットフォーム（来校・対応予定／申込〜初回面談／体験生アタックリスト／イベント進捗）用スキーマ。
-- Supabaseダッシュボードの「SQL Editor」に貼り付けて実行してください（001〜006実行済みが前提）。
-- ※ 本番DBには旧ファイル名「005_management_platform.sql」で適用済み（番号重複の解消のため 007 に改名。内容は同一で、再実行しても安全）。
-- ※ 未解決の注意：006以前の 005_appointment_integrity.sql の制約（kind は test/interview のみ・面談の時間重複禁止）は、
--    この管理機能の「日程変更済／取消の予約を残す」「説明会・体験などの予定種別」と両立しない。統合時に制約の見直しを別番号で追加する。
-- 何度実行しても壊れないよう IF NOT EXISTS / NOT EXISTS で書いている。既存テーブルの列は削除・変更しない。
--
-- 認証方針：入口は共有パスワード（既存の/staffログイン）。個人の識別はログインではなく、
-- 記入時に schedule_staff_members のプルダウンから担当者を選ぶ方式。
-- 同時編集で他人の更新を無言で上書きしないため、更新対象には version 列（楽観ロック）を持たせる。

-- ---------- スタッフ名簿（プルダウンの選択肢） ----------
CREATE TABLE IF NOT EXISTS schedule_staff_members (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,   -- 利用停止した担当は FALSE（過去記録は残す）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 生徒（1人に1つ。申込・予約・履歴の共通キー） ----------
CREATE TABLE IF NOT EXISTS schedule_students (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  name_kana         TEXT NOT NULL DEFAULT '',
  school            TEXT NOT NULL DEFAULT '',
  grade             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  primary_staff_id  TEXT REFERENCES schedule_staff_members(id),  -- 主担当（当日担当とは別）
  merge_candidate_of TEXT REFERENCES schedule_students(id),      -- 名寄せ候補（自動統合はしない。スタッフ確認用）
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 体験中の生徒情報（志望校・方針・意思・連絡可否など。1生徒1行）
CREATE TABLE IF NOT EXISTS schedule_student_profiles (
  student_id          TEXT PRIMARY KEY REFERENCES schedule_students(id),
  notes               TEXT NOT NULL DEFAULT '',   -- 特記事項
  issues              TEXT NOT NULL DEFAULT '',   -- 学習課題
  support_policy      TEXT NOT NULL DEFAULT '',   -- 主担当の支援方針
  roadmap             TEXT NOT NULL DEFAULT '',   -- 入学ロードマップ
  segment             TEXT NOT NULL DEFAULT '',   -- 旧コードの定義確認後に設定。固定しない
  desired_university  TEXT NOT NULL DEFAULT '',
  desired_faculty     TEXT NOT NULL DEFAULT '',
  desired_department  TEXT NOT NULL DEFAULT '',
  intent_status       TEXT NOT NULL DEFAULT 'unconfirmed',  -- 'unconfirmed' | 'confirmed' | 'considering' | 'declined'
  enrollment_status   TEXT NOT NULL DEFAULT 'not_enrolled', -- 'not_enrolled' | 'enrolled'
  enrolled_at         TIMESTAMPTZ,
  contact_ok          BOOLEAN NOT NULL DEFAULT TRUE,        -- FALSE=アタック不可（再連絡対象に混ぜない）
  version             INTEGER NOT NULL DEFAULT 1,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- イベント（冬期招待講習・特定日の公開授業など開催単位） ----------
CREATE TABLE IF NOT EXISTS schedule_events (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  starts_on             DATE,
  ends_on               DATE,
  count_from            DATE,                -- 集計対象期間
  count_to              DATE,
  mobilization_stage    TEXT,                -- 動員の定義: 'applied' | 'booked' | 'visited'。NULL=未定義（達成率を出さない）
  mobilization_target   INTEGER,             -- NULL=未設定
  enrollment_target     INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_events_stage_chk CHECK (mobilization_stage IS NULL OR mobilization_stage IN ('applied','booked','visited'))
);

-- 生徒×イベントの申込（再申込・別イベント追加でも履歴を失わない）
CREATE TABLE IF NOT EXISTS schedule_enrollments (
  id               TEXT PRIMARY KEY,
  student_id       TEXT NOT NULL REFERENCES schedule_students(id),
  event_id         TEXT REFERENCES schedule_events(id),       -- NULL=イベント未割当
  application_id   TEXT UNIQUE REFERENCES schedule_applications(id),  -- 手動登録はNULL
  raw_type         TEXT NOT NULL,                              -- 申込種別
  channel          TEXT NOT NULL DEFAULT 'form',               -- 'form' | 'mail' | 'phone' | 'visit' | 'referral'
  is_primary_trigger BOOLEAN,                                  -- 入学の主なきっかけ。NULL=未設定（勝手に付け替えない）
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 申込種別ごとの設定（テスト・面談・体験の要否）
CREATE TABLE IF NOT EXISTS schedule_type_settings (
  raw_type            TEXT PRIMARY KEY,
  test_required       BOOLEAN NOT NULL DEFAULT FALSE,
  interview_required  BOOLEAN NOT NULL DEFAULT FALSE,
  trial_applicable    BOOLEAN NOT NULL DEFAULT FALSE,
  note                TEXT NOT NULL DEFAULT ''
);

-- ---------- 既存テーブルへの列追加 ----------
ALTER TABLE schedule_applications ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES schedule_students(id);

ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES schedule_students(id);
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT '';
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS assigned_staff_id TEXT REFERENCES schedule_staff_members(id); -- 予定担当
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'booked';  -- 'booked' | 'rescheduled' | 'cancelled'
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS rescheduled_from_id TEXT REFERENCES schedule_appointments(id);
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS is_visit BOOLEAN NOT NULL DEFAULT TRUE;   -- FALSE=電話等の非来校対応
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- kind は既存の 'test' | 'interview' に加え、'briefing' | 'trial' | 'lecture' | 'call' 等を許容する（CHECK制約は元々無い）

CREATE INDEX IF NOT EXISTS idx_schedule_appointments_start ON schedule_appointments (start_at);
CREATE INDEX IF NOT EXISTS idx_schedule_appointments_student ON schedule_appointments (student_id);

-- ---------- 実績（予定とは別。日時経過だけで実施済にしない） ----------
CREATE TABLE IF NOT EXISTS schedule_outcomes (
  id                 TEXT PRIMARY KEY,
  student_id         TEXT NOT NULL REFERENCES schedule_students(id),
  appointment_id     TEXT REFERENCES schedule_appointments(id),   -- NULL=予定なしの当日来校
  result             TEXT NOT NULL,                               -- 'done' | 'absent' | 'cancelled'（未記録=行なし）
  purpose            TEXT NOT NULL DEFAULT '',
  actual_staff_id    TEXT REFERENCES schedule_staff_members(id),  -- 実際の対応者
  occurred_at        TIMESTAMPTZ NOT NULL,
  content            TEXT NOT NULL DEFAULT '',
  reaction           TEXT NOT NULL DEFAULT '',
  recorded_by        TEXT REFERENCES schedule_staff_members(id),
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_outcomes_result_chk CHECK (result IN ('done','absent','cancelled'))
);
-- 1予定につき実績は1件（同じ予定の二重記録を防ぐ）
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_outcomes_appointment
  ON schedule_outcomes (appointment_id) WHERE appointment_id IS NOT NULL;

-- ---------- 電話・連絡記録 ----------
CREATE TABLE IF NOT EXISTS schedule_contact_logs (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES schedule_students(id),
  channel        TEXT NOT NULL DEFAULT 'phone',   -- 'phone' | 'mail' | 'line' | 'visit'
  result         TEXT NOT NULL,                   -- 'no_answer' | 'connected' | 'callback_wait' | 'other'
  contacted_at   TIMESTAMPTZ NOT NULL,
  staff_id       TEXT REFERENCES schedule_staff_members(id),
  content        TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 次の対応 ----------
CREATE TABLE IF NOT EXISTS schedule_tasks (
  id                 TEXT PRIMARY KEY,
  student_id         TEXT NOT NULL REFERENCES schedule_students(id),
  enrollment_id      TEXT REFERENCES schedule_enrollments(id),
  content            TEXT NOT NULL,
  assigned_staff_id  TEXT REFERENCES schedule_staff_members(id),   -- NULL=担当未設定（一覧で検出）
  due_on             DATE,                                         -- NULL=期限未設定（一覧で検出）
  status             TEXT NOT NULL DEFAULT 'todo',                 -- 'todo' | 'doing' | 'done' | 'cancelled'
  source_type        TEXT,                                         -- 'contact_log' | 'outcome' | 'manual'
  source_id          TEXT,
  dedupe_key         TEXT UNIQUE,                                  -- 同じ記録の再処理で重複作成しない
  result_note        TEXT NOT NULL DEFAULT '',
  closed_reason      TEXT NOT NULL DEFAULT '',                     -- 中止・対応不要の理由
  completed_at       TIMESTAMPTZ,
  completed_by       TEXT REFERENCES schedule_staff_members(id),
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_tasks_status_chk CHECK (status IN ('todo','doing','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_tasks_open ON schedule_tasks (status, due_on);

-- ---------- 引継ぎ（長文メモだけにしない） ----------
CREATE TABLE IF NOT EXISTS schedule_handovers (
  id               TEXT PRIMARY KEY,
  student_id       TEXT NOT NULL REFERENCES schedule_students(id),
  appointment_id   TEXT REFERENCES schedule_appointments(id),
  to_check         TEXT NOT NULL DEFAULT '',   -- 今回確認すること・伝えること
  confirmed        TEXT NOT NULL DEFAULT '',   -- 確認できたこと
  remaining        TEXT NOT NULL DEFAULT '',   -- 残ったこと（未確認は次の対応へ）
  note_to_primary  TEXT NOT NULL DEFAULT '',   -- 主担当への連絡事項
  staff_id         TEXT REFERENCES schedule_staff_members(id),
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 感度（根拠・確認日つき。未確認は0と区別） ----------
CREATE TABLE IF NOT EXISTS schedule_sensitivity_logs (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES schedule_students(id),
  value         INTEGER,                       -- NULL=未確認
  basis         TEXT NOT NULL DEFAULT '',
  confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  staff_id      TEXT REFERENCES schedule_staff_members(id),
  CONSTRAINT schedule_sensitivity_value_chk CHECK (value IS NULL OR value IN (0,25,50,75,100))
);

-- ---------- 学習進捗・説明会/アンケート回答（POS自動取得ではなく手入力） ----------
CREATE TABLE IF NOT EXISTS schedule_study_progress (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES schedule_students(id),
  course        TEXT NOT NULL DEFAULT '',      -- 講座
  planned       INTEGER,                       -- 受講計画コマ数
  completed     INTEGER,                       -- 受講済コマ数
  judgement     TEXT NOT NULL DEFAULT '',      -- 確認テスト／修了判定
  updated_by    TEXT REFERENCES schedule_staff_members(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 変更履歴（誰がいつ何を変えたか） ----------
CREATE TABLE IF NOT EXISTS schedule_audit_log (
  id          TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,                   -- 'insert' | 'update' | 'delete'
  staff_id    TEXT REFERENCES schedule_staff_members(id),
  diff        JSONB,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_audit_record ON schedule_audit_log (table_name, record_id);

-- ---------- 既存申込からの移行（1申込=1生徒。氏名・メールでの自動名寄せはしない） ----------
INSERT INTO schedule_students (id, name, name_kana, school, grade, email, phone, created_at)
SELECT 'stu_' || a.id, a.name, a.name_kana, a.school, a.grade, a.email, a.phone, a.created_at
FROM schedule_applications a
WHERE a.student_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM schedule_students s WHERE s.id = 'stu_' || a.id);

UPDATE schedule_applications SET student_id = 'stu_' || id WHERE student_id IS NULL;

UPDATE schedule_appointments ap SET student_id = a.student_id
FROM schedule_applications a
WHERE ap.application_id = a.id AND ap.student_id IS NULL;

INSERT INTO schedule_enrollments (id, student_id, application_id, raw_type, channel, created_at)
SELECT 'enr_' || a.id, a.student_id, a.id, a.raw_type, 'form', a.created_at
FROM schedule_applications a
WHERE NOT EXISTS (SELECT 1 FROM schedule_enrollments e WHERE e.application_id = a.id);

-- 種別の初期設定（個別説明会はテスト不要＝既存要件。他は運用確定まで仮置き。管理画面から変更可能にする）
INSERT INTO schedule_type_settings (raw_type, test_required, interview_required, trial_applicable, note) VALUES
  ('special_invite',         TRUE,  TRUE,  TRUE,  '仮設定'),
  ('briefing',               FALSE, TRUE,  FALSE, '個別説明会はテスト不要（既存要件）'),
  ('school_course_briefing', FALSE, TRUE,  FALSE, '仮設定'),
  ('document_request',       FALSE, FALSE, FALSE, '仮設定。全員に体験を強制しない'),
  ('open_class',             FALSE, FALSE, FALSE, '仮設定'),
  ('trial_day',              FALSE, TRUE,  TRUE,  '仮設定'),
  ('week_intensive_trial',   FALSE, TRUE,  TRUE,  '仮設定')
ON CONFLICT (raw_type) DO NOTHING;

-- ---------- RLS（既存方針どおり：ポリシーなし＝service_roleのみ） ----------
ALTER TABLE schedule_staff_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_enrollments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_type_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_outcomes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_contact_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_handovers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_sensitivity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_study_progress   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_audit_log        ENABLE ROW LEVEL SECURITY;
