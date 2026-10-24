// X-Forwarded-For の先頭は利用者が自由に書けるため信用しない。
// Vercel が付ける x-real-ip（利用者の値を上書きする）を優先し、無ければ最後の経由元（直前のプロキシが見た接続元）を使う。
export function clientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((v) => v.trim()).filter(Boolean).pop();
  return last ?? "unknown";
}
