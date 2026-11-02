-- メール取込の定期実行の状態（連続失敗の回数・最後の成功時刻・通知済みか）。009実行後に実行。何度実行しても安全。
-- 失敗が続いたときに1回だけ通知し、復旧したときに1回だけ知らせるために、実行の合間も覚えておく。
CREATE TABLE IF NOT EXISTS schedule_mail_poll_state (
  id                    TEXT PRIMARY KEY,                 -- 常に 'main'（1行だけ使う）
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  last_success_at       TIMESTAMPTZ,
  last_failure_at       TIMESTAMPTZ,
  last_failure_kind     TEXT NOT NULL DEFAULT '',         -- 'tls' | 'auth' | 'timeout' | 'database' | 'other'（原因の種類だけ。詳細は保存しない）
  alerted               BOOLEAN NOT NULL DEFAULT FALSE,   -- 連続失敗を通知済み
  stale_alerted         BOOLEAN NOT NULL DEFAULT FALSE,   -- 「長時間成功がない」を通知済み
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE schedule_mail_poll_state ENABLE ROW LEVEL SECURITY;
