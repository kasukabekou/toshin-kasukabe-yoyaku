-- イベント進捗用。イベントが集計する申込種別（raw_type）を持たせる。何度実行しても安全。
-- 申込数＝その種別の申込（イベント未割当のもの）のうち、集計期間（count_from〜count_to）内に受け付けた生徒の数。
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS raw_type TEXT;
