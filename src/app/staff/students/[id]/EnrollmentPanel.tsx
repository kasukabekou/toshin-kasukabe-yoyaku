"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/primitives";
import { RecorderField, postJson } from "@/components/staff/ActingStaff";

// 入学の手動記録。入学済みなら日付を表示し、誤記録は取り消せる。
export function EnrollmentPanel({ studentId, enrolledAt }: { studentId: string; enrolledAt: string | null }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
  const [message, setMessage] = useState<string | null>(null);

  async function save(enrolled: boolean) {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    if (!enrolled && !window.confirm("入学の記録を取り消します。よろしいですか？")) return;
    setMessage(null);
    const r = await postJson(`/api/staff/manage/students/${studentId}/enrollment`, { staffId: actingStaff, enrolled, enrolledOn: enrolled ? date : undefined }, "PATCH");
    if (!r.ok) return setMessage(r.message);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
      <span className={enrolledAt ? "rounded bg-green-100 px-2 py-1 font-medium text-green-800" : "rounded bg-subtle px-2 py-1 text-mutedfg"}>
        {enrolledAt ? `入学済（${new Date(enrolledAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）` : "未入学"}
      </span>
      <div className="w-40"><RecorderField value={actingStaff} onChange={setActingStaff} /></div>
      {!enrolledAt && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />}
      {enrolledAt ? (
        <Button type="button" variant="secondary" onClick={() => save(false)}>入学を取り消す</Button>
      ) : (
        <Button type="button" variant="primary" onClick={() => save(true)}>入学を記録</Button>
      )}
      {message && <p className="w-full text-red-600">{message}</p>}
    </div>
  );
}
