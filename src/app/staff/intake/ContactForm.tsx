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
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("16:00");
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
    if (!r.ok) {
      setBusy(false);
      return setMessage(r.message);
    }
    // 次回来校日が入っていれば来校予定として登録（来校・対応予定の「明日の来校予定」などに載る）
    if (visitDate) {
      const startAt = new Date(`${visitDate}T${visitTime}:00+09:00`);
      const v = await postJson("/api/staff/manage/appointments", {
        clientId: `${clientId.current}v`, studentId, kind: "visit", purpose: "来校", staffId: actingStaff, assignedStaffId: taskStaff,
        startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + 60 * 60000).toISOString(),
      });
      if (!v.ok) {
        setBusy(false);
        return setMessage(`連絡は保存しました。次回来校の登録に失敗: ${v.message}`);
      }
    }
    setBusy(false);
    clientId.current = newClientId();
    setOpen(false);
    setContent("");
    setTaskContent("");
    setDueOn("");
    setVisitDate("");
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
      <p className="font-medium text-fg">次回来校予定(任意)</p>
      <div className="flex gap-2">
        <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        <Input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="w-28" />
      </div>
      <RecorderField value={actingStaff} onChange={setActingStaff} />
      {message && <p className="text-red-600">{message}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="primary" onClick={save} disabled={busy}>保存</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>閉じる</Button>
      </div>
    </div>
  );
}
