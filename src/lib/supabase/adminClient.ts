import "server-only";
import { createClient } from "@supabase/supabase-js";

// サーバー専用（Service Roleキー使用）。"use client" ファイルから絶対にimportしないこと。
// RLSをバイパスする強い権限のため、このファイルの参照元はAPI Route / Server Componentに限定する。

// 開発機が社内プロキシ経由でないと外部（Supabase）にアクセスできない環境向け。
// Node標準のfetchはブラウザ/curlと違いプロキシ環境変数を自動では使わないため明示的に設定する。
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  const { setGlobalDispatcher, EnvHttpProxyAgent } = require("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。.env.local を確認してください（.env.example参照）。"
  );
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
