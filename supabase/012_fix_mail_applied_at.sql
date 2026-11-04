-- 受験登録完了メール（全国統一高校生テストなど）は本文に申込日時が無いため、登録時に「取り込んだ時刻」が申込日になっていた。
-- メールの受信日時（schedule_mail_ingests.received_at）に直す。Web申込フォームのメール（本文に申込日時あり）は対象外。
-- 何度実行しても同じ結果になる。
UPDATE schedule_enrollments e
SET created_at = i.received_at
FROM schedule_mail_ingests i
WHERE e.id = 'enr_' || i.id
  AND e.channel = 'mail'
  AND i.received_at IS NOT NULL
  AND i.parsed->>'submittedAt' IS NULL;
