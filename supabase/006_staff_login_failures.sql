-- スタッフログインの総当たり対策：失敗したログインをIPごとに記録し、短時間の連続失敗を制限する。
-- 画面には表示しない（サーバー内部の不正検知用途のみ）。古い行は定期的に削除してよい。
CREATE TABLE IF NOT EXISTS schedule_staff_login_failures (
  id          TEXT PRIMARY KEY,
  ip_address  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_staff_login_failures_ip_created
  ON schedule_staff_login_failures (ip_address, created_at);

ALTER TABLE schedule_staff_login_failures ENABLE ROW LEVEL SECURITY;
-- ポリシーは意図的に追加しない（service_roleのみアクセス可）
