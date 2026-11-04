-- 学力診断テストの種別変更：高2は高3と同じ共テ型にする（高1は基礎力型のまま）。
-- まだ予約を確定していない（トークン未使用の）高2の申込だけを切り替える。予約済みの申込は変更しない。
-- 何度実行しても同じ結果になる。
UPDATE schedule_applications a
SET grade_group = 'g3'
WHERE a.grade = '高2'
  AND a.grade_group = 'g12'
  AND NOT EXISTS (SELECT 1 FROM schedule_tokens t WHERE t.application_id = a.id AND t.used_at IS NOT NULL);
