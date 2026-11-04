"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { StaffSelect } from "@/components/staff/StaffSelect";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { RecorderField, newClientId, postJson } from "@/components/staff/ActingStaff";

interface Appt {
  id: string;
  kind: string;
  label: string;
  purpose: string;
  status: string;
  assignedStaffId: string | null;
  version: number;
}

const KIND_LABELS: Record<string, string> = { test: "学力診断テスト", interview: "初回三者面談", briefing: "説明会", trial: "体験", lecture: "受講", call: "電話" };
const STATUS_LABELS: Record<string, string> = { booked: "予約中", rescheduled: "日程変更済", cancelled: "取消" };

// 予定担当の設定と、実績（実施済・欠席・中止）の記録。実績は予定とは別に保存する。
export function AppointmentRow({ studentId, appt, outcomeLabel }: { studentId: string; appt: Appt; outcomeLabel: string | null }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const clientId = useRef(newClientId());
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("done");
  const [actual, setActual] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskStaff, setTaskStaff] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function assign(id: string | null) {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    const r = await postJson(`/api/staff/manage/appointments/${appt.id}`, { version: appt.version, staffId: actingStaff, assignedStaffId: id }, "PATCH");
    if (!r.ok) return setMessage(r.message);
    router.refresh();
  }

  async function saveOutcome() {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    const r = await postJson("/api/staff/manage/outcomes", {
      clientId: clientId.current,
      studentId,
      appointmentId: appt.id,
      result,
      purpose: appt.purpose,
      actualStaffId: actual ?? actingStaff,
      staffId: actingStaff,
      content,
      nextTask: taskContent ? { content: taskContent, assignedStaffId: taskStaff, dueOn: dueOn || null } : undefined,
    });
    if (!r.ok) return setMessage(r.message);
    setOpen(false);
    router.refresh();
  }

  const active = appt.status === "booked";
  return (
    <div className={`rounded-lg border border-border bg-surface p-3 text-xs ${active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg">
          {KIND_LABELS[appt.kind] ?? appt.kind} ・ {appt.label}
          <span className="ml-2 rounded bg-subtle px-2 py-0.5 text-mutedfg">{STATUS_LABELS[appt.status] ?? appt.status}</span>
        </p>
        <span className="text-mutedfg">{outcomeLabel ?? (active ? "実績未記録" : "")}</span>
      </div>
      <div className="mt-1"><DeleteButton description="この予定（紐づく実績を含む）を削除します。Googleカレンダーの予定は削除されません。" url={`/api/staff/manage/records/appointments/${appt.id}`} /></div>
      {active && !outcomeLabel && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-40"><RecorderField value={actingStaff} onChange={setActingStaff} /></div>
          <StaffSelect value={appt.assignedStaffId} onChange={assign} placeholder="予定担当(未設定)" className="w-40" />
          {!open && <Button type="button" variant="secondary" onClick={() => setOpen(true)}>実績を入力</Button>}
        </div>
      )}
      {open && (
        <div className="mt-2 w-80 space-y-2 rounded-lg border border-border p-3">
          <Select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="done">実施済</option>
            <option value="absent">欠席</option>
            <option value="cancelled">中止</option>
          </Select>
          <StaffSelect value={actual} onChange={setActual} placeholder="実際の対応者(記入者)" />
          <Textarea rows={3} placeholder="内容・反応" value={content} onChange={(e) => setContent(e.target.value)} />
          <p className="font-medium text-fg">次の対応{result === "done" ? "(任意)" : "(再調整など)"}</p>
          <Input placeholder="例: 日程を再調整する" value={taskContent} onChange={(e) => setTaskContent(e.target.value)} />
          <StaffSelect value={taskStaff} onChange={setTaskStaff} placeholder="担当(未設定)" />
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={saveOutcome}>保存</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>閉じる</Button>
          </div>
        </div>
      )}
      {message && <p className="mt-1 text-red-600">{message}</p>}
    </div>
  );
}
