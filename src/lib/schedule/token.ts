import "server-only";

// 不可推測なopaqueトークン。scheduleTokensテーブルでapplicationIdと紐付ける。
export function generateApplicationToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
