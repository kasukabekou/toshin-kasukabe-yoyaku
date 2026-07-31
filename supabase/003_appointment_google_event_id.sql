-- 面談予定をGoogle Calendarに書き込んだ際のイベントIDを保持する（後から予定を追跡・削除できるように）。
ALTER TABLE schedule_appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
