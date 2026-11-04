"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecorderField, postJson } from "./ActingStaff";

// 削除の確認つきボタン。記入者を選んで「削除する」を押すまで実行されない（元に戻せない）。
export function DeleteButton({
  label = "削除",
  description,
  url,
  method = "DELETE",
  extraBody,
  afterHref,
  onDone,
  className = "text-xs text-red-600 hover:underline",
}: {
  label?: string;
  description: string;
  url: string;
  method?: "DELETE" | "POST";
  extraBody?: Record<string, unknown>;
  afterHref?: string;
  onDone?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!staff) return setMessage("記入者を選択してください。");
    setBusy(true);
    const r = await postJson(url, { ...extraBody, staffId: staff }, method);
    setBusy(false);
    if (!r.ok) return setMessage(r.message);
    setOpen(false);
    onDone?.();
    if (afterHref) router.push(afterHref);
    else router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className={className} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {label}
      </button>
    );
  }
  return (
    <div className="w-64 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 text-xs" onClick={(e) => e.stopPropagation()}>
      <p className="font-medium text-red-700">{description}</p>
      <p className="text-mutedfg">この操作は元に戻せません。</p>
      <RecorderField value={staff} onChange={setStaff} />
      {message && <p className="text-red-600">{message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={run} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">
          削除する
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border bg-surface px-3 py-1.5">
          キャンセル
        </button>
      </div>
    </div>
  );
}
