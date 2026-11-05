"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { RecorderField, newClientId, postJson } from "@/components/staff/ActingStaff";
import { MANAGE_TYPE_LABELS } from "@/lib/manage/labels";

const num = (v: string) => (v === "" ? null : Number(v));

// イベントの登録。集計する申込種別と集計期間、動員目標（申込数）・入学目標を入れる。
export function EventForm() {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const clientId = useRef(newClientId());
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", rawType: "special_invite", startsOn: "", endsOn: "", countFrom: "", countTo: "", target: "", enrollTarget: "" });
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return setMessage("イベント名を入力してください。");
    if (!actingStaff) return setMessage("記入者を選択してください。");
    const r = await postJson("/api/staff/manage/events", {
      clientId: clientId.current,
      name: f.name.trim(),
      rawType: f.rawType,
      staffId: actingStaff,
      startsOn: f.startsOn || null,
      endsOn: f.endsOn || null,
      countFrom: f.countFrom || null,
      countTo: f.countTo || null,
      mobilizationTarget: num(f.target),
      enrollmentTarget: num(f.enrollTarget),
    });
    if (!r.ok) return setMessage(r.message);
    clientId.current = newClientId();
    setOpen(false);
    setF({ ...f, name: "" });
    router.refresh();
  }

  if (!open) return <Button type="button" variant="secondary" onClick={() => setOpen(true)}>＋ イベントを登録</Button>;
  return (
    <div className="w-full max-w-xl space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
      <Field label="イベント名"><Input value={f.name} onChange={set("name")} placeholder="例: 冬期特別招待講習" /></Field>
      <Field label="集計する申込種別">
        <Select value={f.rawType} onChange={set("rawType")}>
          {Object.entries(MANAGE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="開催日（から）"><Input type="date" value={f.startsOn} onChange={set("startsOn")} /></Field>
        <Field label="開催日（まで）"><Input type="date" value={f.endsOn} onChange={set("endsOn")} /></Field>
        <Field label="集計期間（から）"><Input type="date" value={f.countFrom} onChange={set("countFrom")} /></Field>
        <Field label="集計期間（まで）"><Input type="date" value={f.countTo} onChange={set("countTo")} /></Field>
        <Field label="動員目標（申込数）"><Input type="number" min={0} value={f.target} onChange={set("target")} /></Field>
        <Field label="入学目標"><Input type="number" min={0} value={f.enrollTarget} onChange={set("enrollTarget")} /></Field>
      </div>
      <RecorderField value={actingStaff} onChange={setActingStaff} />
      {message && <p className="text-red-600">{message}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="primary" onClick={save}>登録</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>閉じる</Button>
      </div>
    </div>
  );
}
