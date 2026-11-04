"use client";
import { StaffSelect } from "./StaffSelect";

// 記入者は、記録・更新するフォームの中で毎回選ぶ（画面上部に固定しない。選び忘れ・別人の名義での記録を防ぐ）。
export function RecorderField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-fg">
        記入者 <span className="text-red-600">必須</span>
      </span>
      <StaffSelect value={value} onChange={onChange} placeholder="選択してください" className={value ? "" : "border-amber-400"} />
    </label>
  );
}

// API 呼び出し用の共通 fetch。409（他のスタッフが先に更新）などはメッセージを返す。
export async function postJson(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, json };
  return { ok: false, message: (json as { message?: string }).message ?? "保存に失敗しました。時間をおいて再度お試しください。" };
}

export function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
