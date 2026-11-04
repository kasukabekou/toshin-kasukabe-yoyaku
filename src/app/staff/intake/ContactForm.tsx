"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Textarea, Input } from "@/components/ui/primitives";
import { StaffSelect } from "@/components/staff/StaffSelect";
import { RecorderField, newClientId, postJson } from "@/components/staff/ActingStaff";

// 連絡結果を保存した同じ画面で、次の対応（内容・担当・期限）まで設定できる。
export function ContactForm({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const clientId = useRef(newClientId()); // 二重送信・再処理で連絡記録/次の対応が増えない
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("no_answer");
  const [content, setContent] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskStaff, setTaskStaff] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    setBusy(true);
    setMessage(null);
    const r = await postJson("/api/staff/manage/contact-logs", {
      clientId: clientId.current,
      studentId,
      result,
      content,
      staffId: actingStaff,
      nextTask: taskContent ? { content: taskContent, assignedStaffId: taskStaff, dueOn: dueOn || null } : undefined,
    });
    setBusy(false);
    if (!r.ok) return setMessage(r.message);
    clientId.current = newClientId();
    setOpen(false);
    setContent("");
    setTaskContent("");
    setDueOn("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        連絡を記録
      </Button>
    );
  }
  return (
    <div className="mt-2 w-72 space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
      <Select value={result} onChange={(e) => setResult(e.target.value)}>
        <option value="no_answer">不通</option>
        <option value="connected">本人・保護者と接続</option>
        <option value="callback_wait">折返し待ち</option>
        <option value="other">その他</option>
      </Select>
      <Textarea rows={2} placeholder="内容" value={content} onChange={(e) => setContent(e.target.value)} />
      <p className="font-medium text-fg">次の対応(任意)</p>
      <Input placeholder="例: 15時ごろ再度架電" value={taskContent} onChange={(e) => setTaskContent(e.target.value)} />
      <StaffSelect value={taskStaff} onChange={setTaskStaff} placeholder="担当(未設定)" />
      <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      <RecorderField value={actingStaff} onChange={setActingStaff} />
      {message && <p className="text-red-600">{message}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="primary" onClick={save} disabled={busy}>保存</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>閉じる</Button>
      </div>
    </div>
  );
}
