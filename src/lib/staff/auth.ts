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

export function verifyAccessCode(code: string): boolean {
  const expected = process.env.STAFF_ACCESS_CODE;
  if (!expected) {
    throw new Error("STAFF_ACCESS_CODE が未設定です。");
  }
  return textEqual(code, expected);
}

export async function buildSessionCookieValue(): Promise<string> {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    throw new Error("STAFF_SESSION_SECRET が未設定です。");
  }
  return hmacHex(secret, "staff_ok");
}

export async function isValidSessionCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await buildSessionCookieValue();
  return textEqual(value, expected);
}
