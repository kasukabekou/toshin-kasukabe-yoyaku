"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { RecorderField, newClientId, postJson } from "@/components/staff/ActingStaff";
import { RAW_TYPE_LABELS } from "@/lib/booking/logic";

export function NewStudentForm() {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const clientId = useRef(newClientId()); // 二重送信しても同じ生徒を作らない
  const [f, setF] = useState({ name: "", nameKana: "", school: "", grade: "", email: "", phone: "", rawType: "special_invite", channel: "phone" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return setMessage("氏名を入力してください。");
    if (!actingStaff) return setMessage("記入者を選択してください。");
    setBusy(true);
    const r = await postJson("/api/staff/manage/students", { clientId: clientId.current, ...f, staffId: actingStaff });
    setBusy(false);
    if (!r.ok) return setMessage(r.message);
    router.push(`/staff/students/${r.json.studentId}`);
  }

  return (
    <div className="space-y-3">
      <Field label="氏名"><Input value={f.name} onChange={set("name")} /></Field>
      <Field label="ふりがな"><Input value={f.nameKana} onChange={set("nameKana")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="学校"><Input value={f.school} onChange={set("school")} /></Field>
        <Field label="学年"><Input value={f.grade} onChange={set("grade")} placeholder="高1 など" /></Field>
        <Field label="メール"><Input value={f.email} onChange={set("email")} /></Field>
        <Field label="電話"><Input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="申込種別">
          <Select value={f.rawType} onChange={set("rawType")}>
            {Object.entries(RAW_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="経路">
          <Select value={f.channel} onChange={set("channel")}>
            <option value="phone">電話</option>
            <option value="visit">来校</option>
            <option value="referral">紹介</option>
            <option value="mail">メール</option>
          </Select>
        </Field>
      </div>
      <RecorderField value={actingStaff} onChange={setActingStaff} />
      {message && <p className="text-sm text-red-600">{message}</p>}
      <Button type="button" variant="primary" onClick={save} disabled={busy}>登録する</Button>
    </div>
  );
}
