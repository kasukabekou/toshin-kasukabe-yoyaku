-- POPで確認済みのメール（サーバー上の固有ID=UIDL）の記録。008実行後に実行。（旧ファイル名 008_mail_pop_seen.sql。未適用）何度実行しても安全。
-- サーバーからメールを削除しない（Outlookと共存する）ため、処理済みかどうかをこちらで覚える。
CREATE TABLE IF NOT EXISTS schedule_mail_pop_seen (
  uid      TEXT PRIMARY KEY,
  seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note     TEXT NOT NULL DEFAULT ''     -- 'baseline'（初回に既存分として記録）| 'ingested' | 'skipped'（申込通知以外）
);
ALTER TABLE schedule_mail_pop_seen ENABLE ROW LEVEL SECURITY;
