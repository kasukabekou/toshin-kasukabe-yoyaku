// Next.js の middleware は Edge Runtime で動くため node:crypto は使えない。
// Web Crypto API（globalThis.crypto.subtle）はEdge/Node両方で動くのでこちらを使う。

export const STAFF_COOKIE_NAME = "staff_session";

function textEqual(a: string, b: string): boolean {
  // 長さが違う場合は即falseだが、値の内容比較はHMAC自体が担保するため、ここでのタイミング差は実害がない。
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sessionSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    throw new Error("STAFF_SESSION_SECRET が未設定です。");
  }
  return secret;
}

// 入力と正解を同じ鍵でHMACしてから比べる（長さの違いが応答時間に出ないようにするため）。
export async function verifyAccessCode(code: string): Promise<boolean> {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) {
    throw new Error("STAFF_ACCESS_CODE が未設定です。");
  }
  const secret = sessionSecret();
  return textEqual(await hmacHex(secret, `code:${code}`), await hmacHex(secret, `code:${expected}`));
}

// セッションの有効期間。Cookieの期限（ブラウザ側）だけでなく、値そのものに発行時刻を入れてサーバー側でも期限切れにする。
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12時間

// Cookie値は「発行時刻.署名」。漏れても期限が来れば使えなくなる。
// 全員を即時ログアウトさせたいときは STAFF_SESSION_SECRET を変更する。
export async function buildSessionCookieValue(now: number = Date.now()): Promise<string> {
  const issuedAt = String(now);
  return `${issuedAt}.${await hmacHex(sessionSecret(), `staff:${issuedAt}`)}`;
}

export async function isValidSessionCookieValue(value: string | undefined, now: number = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [issuedAt, signature] = value.split(".");
  if (!issuedAt || !signature || !/^\d+$/.test(issuedAt)) return false;
  const age = now - Number(issuedAt);
  if (age < -60_000 || age > STAFF_SESSION_MAX_AGE_SECONDS * 1000) return false;
  return textEqual(signature, await hmacHex(sessionSecret(), `staff:${issuedAt}`));
}
