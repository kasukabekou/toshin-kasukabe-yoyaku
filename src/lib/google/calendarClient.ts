import "server-only";
import { createSign } from "node:crypto";

// 開発機が社内プロキシ経由でないと外部にアクセスできない環境向け（Node標準fetchはプロキシ環境変数を自動で見ないため）
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { setGlobalDispatcher, EnvHttpProxyAgent } = require("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// freebusy参照（読み取り）と、面談確定時の予定作成（書き込み）の両方に使うためフルスコープにする。
const SCOPE = "https://www.googleapis.com/auth/calendar";

// Service Account が未設定の場合は null を返す（呼び出し側は schedule_busy_blocks へフォールバックする）
export function isGoogleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && process.env.GOOGLE_CALENDAR_ID);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildAssertion(email: string, privateKey: string, iatSec: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: iatSec,
    exp: iatSec + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64url(signer.sign(privateKey))}`;
}

// このPCはNTP同期が社内ポリシーでブロックされておりシステム時計がズレることがあるため、
// Googleのトークンエンドポイントの応答（Dateヘッダー）を使って発行時刻を補正し、1回だけ再試行する。
export async function getGoogleAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です。");
  }

  let clockOffsetMs = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const iatSec = Math.floor((Date.now() + clockOffsetMs) / 1000);
    const assertion = buildAssertion(email, privateKey, iatSec);
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { access_token: string };
      return data.access_token;
    }
    if (attempt === 0) {
      const dateHeader = res.headers.get("date");
      if (dateHeader) {
        clockOffsetMs = new Date(dateHeader).getTime() - Date.now();
        continue;
      }
    }
    const errText = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${errText}`);
  }
  throw new Error("Google token exchange failed after retry");
}
