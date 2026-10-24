-- 初回三者面談の二重予約をDB側で防ぐ。
-- 空き確認（カレンダー再確認）から登録までの間に別の申込が同じ時間帯を確定させた場合、
-- 後から来た登録は排他制約違反（23P01）になり、API は interview_slot_taken を返す。
-- 制約は 2026-10-25 以降の面談にだけ効かせる。それ以前には、過去に二重に確定してしまった
-- 記録（同一時間帯の面談）が残っているため、既存データを消さずに適用できるようにしている。
ALTER TABLE schedule_appointments
  ADD CONSTRAINT schedule_appointments_interview_no_overlap
  EXCLUDE USING gist (tstzrange(start_at, end_at) WITH &&)
  WHERE (kind = 'interview' AND start_at >= '2026-10-25T00:00:00+09:00');

ALTER TABLE schedule_appointments
  ADD CONSTRAINT schedule_appointments_kind_check CHECK (kind IN ('test', 'interview'));

CREATE INDEX IF NOT EXISTS idx_schedule_appointments_application ON schedule_appointments (application_id);
CREATE INDEX IF NOT EXISTS idx_schedule_test_subject_selections_application ON schedule_test_subject_selections (application_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tokens_application ON schedule_tokens (application_id);
