-- 申込導線をアプリ内で完結させる変更に伴うスキーマ追加分。
-- Supabaseダッシュボードの「SQL Editor」に貼り付けて実行してください（001実行済みが前提）。

ALTER TABLE schedule_applications ADD COLUMN IF NOT EXISTS name_kana TEXT NOT NULL DEFAULT '';

-- schedule_pattern_a_answers の kanji_name / kana_name / contact_phone は
-- 共通の申込ステップ（schedule_applications の name / name_kana / phone）と重複するため
-- アプリ側では参照しなくなったが、互換性のため列自体は削除しない。
