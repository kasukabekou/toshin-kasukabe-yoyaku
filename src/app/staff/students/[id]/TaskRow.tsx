"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";
import { StaffSelect } from "@/components/staff/StaffSelect";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { RecorderField, postJson } from "@/components/staff/ActingStaff";

interface Task {
  id: string;
  content: string;
  status: string;
  assignedStaffId: string | null;
  dueOn: string | null;
  version: number;
  closedReason: string;
}

const STATUS_LABELS: Record<string, string> = { todo: "未着手", doing: "対応中", done: "完了", cancelled: "中止" };

export function TaskRow({ task }: { task: Task }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closed = task.status === "done" || task.status === "cancelled";

  async function patch(fields: Record<string, unknown>) {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    setMessage(null);
    const r = await postJson(`/api/staff/manage/tasks/${task.id}`, { version: task.version, staffId: actingStaff, ...fields }, "PATCH");
    if (!r.ok) return setMessage(r.message);
    router.refresh();
  }

  function cancel() {
    const reason = window.prompt("中止する理由を入力してください");
    if (reason) patch({ status: "cancelled", closedReason: reason });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={closed ? "text-mutedfg line-through" : "text-fg"}>{task.content}</p>
        <span className="rounded bg-subtle px-2 py-0.5 text-mutedfg">{STATUS_LABELS[task.status]}</span>
      </div>
      <div className="mt-1"><DeleteButton description="この次の対応を削除します。" url={`/api/staff/manage/records/tasks/${task.id}`} /></div>
      {task.closedReason && <p className="mt-1 text-mutedfg">理由: {task.closedReason}</p>}
      {!closed && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-40"><RecorderField value={actingStaff} onChange={setActingStaff} /></div>
          <StaffSelect value={task.assignedStaffId} onChange={(id) => patch({ assignedStaffId: id })} placeholder="担当未設定" className="w-36" />
          <Input type="date" defaultValue={task.dueOn ?? ""} onChange={(e) => patch({ dueOn: e.target.value || null })} className="w-40" />
          {task.status === "todo" && <Button type="button" variant="secondary" onClick={() => patch({ status: "doing" })}>対応中にする</Button>}
          <Button type="button" variant="primary" onClick={() => patch({ status: "done" })}>完了</Button>
          <Button type="button" variant="secondary" onClick={cancel}>中止</Button>
        </div>
      )}
      {message && <p className="mt-1 text-red-600">{message}</p>}
    </div>
  );
}
