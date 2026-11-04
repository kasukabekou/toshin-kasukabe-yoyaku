-- 005_appointment_integrity.sql の制約を、管理機能（予定種別の追加・日程変更済/取消の予約を残す）と両立するよう見直す。
-- ・kind の CHECK を外す（'briefing' | 'trial' | 'lecture' | 'call' 等を許容。007の方針）。
-- ・面談の時間重複禁止は、有効な予約（status = 'booked'）だけに効かせる。日程変更済・取消の行は重複してよい。
-- 何度実行しても壊れない。既存データは消さない。
ALTER TABLE schedule_appointments DROP CONSTRAINT IF EXISTS schedule_appointments_kind_check;

ALTER TABLE schedule_appointments DROP CONSTRAINT IF EXISTS schedule_appointments_interview_no_overlap;
ALTER TABLE schedule_appointments
  ADD CONSTRAINT schedule_appointments_interview_no_overlap
  EXCLUDE USING gist (tstzrange(start_at, end_at) WITH &&)
  WHERE (kind = 'interview' AND status = 'booked' AND start_at >= '2026-10-25T00:00:00+09:00');
