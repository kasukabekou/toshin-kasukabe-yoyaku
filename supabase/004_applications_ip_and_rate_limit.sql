-- スパム対策：申込元IPを記録し、同一IPからの短時間大量申込を検知できるようにする。
-- 画面には表示しない（サーバー内部の不正検知用途のみ）。
ALTER TABLE schedule_applications ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_applications_ip_created
  ON schedule_applications (ip_address, created_at);
