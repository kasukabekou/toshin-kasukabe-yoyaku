# AGENTS.md

このリポジトリで作業する AI・新しい担当者向けの作業ルールです。

## 目的

一般生・保護者向けに、学力診断テストと初回三者面談の日程を予約するための Web ページです（Next.js + Supabase）。

## 構成の概要

- `src/app/` — 画面と API ルート（Next.js App Router）
  - `apply/` — 予約の申し込み開始
  - `schedule/[token]/` — 予約ウィザード（テスト・面談の日時選択、確認、完了）
  - `api/` — 予約送信・空き枠取得・ヘルスチェックなどのサーバー処理
- `src/components/` — 共通 UI（`booking/` は予約画面用、`ui/` は汎用部品）
- `src/lib/` — ロジック
  - `booking/` — 予約ロジック（テストあり）
  - `schedule/` — トークン・予約データの扱い
  - `google/` — Google カレンダー連携
  - `email/` / `line/` — 確認メール・LINE 通知
  - `supabase/` — Supabase クライアント
- `supabase/` — DB スキーマのマイグレーション SQL（連番ファイル）
- `scripts/` — 開発用スクリプト

## コマンド

```sh
npm ci            # 依存関係のインストール
npm run dev       # 開発サーバー
npm run typecheck # 型チェック
npm test          # テスト（vitest）
npm run build     # 本番ビルド
```

変更後は `npm run typecheck` と `npm test` が通ることを確認してください。

## 守ること

- LINE・メールの実送信をテストに使わない（送信処理はモックする）
- このリポジトリは public。秘密情報（API キー・トークン・`.env` の値）、生徒・保護者の個人情報、内部 URL や管理画面の所在をコード・ドキュメント・コミットに書かない
- 環境変数は `.env.example` にキー名のみ記載する
- DB マイグレーションは本番環境に適用しない（追加は `supabase/` に SQL を置くまで）
- 変更は目的に必要な範囲に限る。不具合修正は再現テストを先に書く
