-- 初回三者面談の二重予約をDB側で防ぐ。
-- 空き確認（カレンダー再確認）から登録までの間に別の申込が同じ時間帯を確定させた場合、
-- 後から来た登録は排他制約違反（23P01）になり、API は interview_slot_taken を返す。
-- 適用前に、既存データに時間が重なる面談がないか確認すること:
--   SELECT a.id, b.id FROM schedule_appointments a JOIN schedule_appointments b
--     ON a.id < b.id AND a.kind = 'interview' AND b.kind = 'interview'
--    AND tstzrange(a.start_at, a.end_at) && tstzrange(b.start_at, b.end_at);
ALTER TABLE schedule_appointments
  ADD CONSTRAINT schedule_appointments_interview_no_overlap
  EXCLUDE USING gist (tstzrange(start_at, end_at) WITH &&) WHERE (kind = 'interview');

ALTER TABLE schedule_appointments
  ADD CONSTRAINT schedule_appointments_kind_check CHECK (kind IN ('test', 'interview'));

CREATE INDEX IF NOT EXISTS idx_schedule_appointments_application ON schedule_appointments (application_id);
CREATE INDEX IF NOT EXISTS idx_schedule_test_subject_selections_application ON schedule_test_subject_selections (application_id);
CREATE INDEX IF NOT EXISTS idx_schedule_tokens_application ON schedule_tokens (application_id);
