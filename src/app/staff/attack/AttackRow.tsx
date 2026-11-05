"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui/primitives";
import { RecorderField, postJson } from "@/components/staff/ActingStaff";
import { ContactForm } from "../intake/ContactForm";

export interface AttackItem {
  studentId: string;
  name: string;
  school: string;
  grade: string;
  trialLabel: string;
  trialAt: string; // 表示用に整形済み
  lastContact: string; // 表示用。未連絡は ""
  intent: string;
  university: string;
  faculty: string;
  policy: string;
  openTask: string;
}

const INTENT_LABELS: Record<string, string> = { unconfirmed: "未確認", confirmed: "確定", considering: "検討中", declined: "辞退" };
const SAVED = "保存しました。";

// 入学の意思・志望校・支援方針の編集と、連絡の記録（次回来校日つき）。
export function AttackRow({ item }: { item: AttackItem }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const [intent, setIntent] = useState(item.intent);
  const [university, setUniversity] = useState(item.university);
  const [faculty, setFaculty] = useState(item.faculty);
  const [policy, setPolicy] = useState(item.policy);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!actingStaff) return setMessage("記入者を選択してください。");
    setMessage(null);
    const r = await postJson(
      `/api/staff/manage/students/${item.studentId}/profile`,
      { staffId: actingStaff, intentStatus: intent, desiredUniversity: university, desiredFaculty: faculty, supportPolicy: policy },
      "PATCH"
    );
    if (!r.ok) return setMessage(r.message);
    setMessage(SAVED);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/staff/students/${item.studentId}`} className="text-sm font-medium text-primary hover:underline">{item.name}</Link>
          <p className="mt-0.5 text-mutedfg">
            {item.school} {item.grade} ・ {item.trialLabel}（{item.trialAt}）・ 最終連絡: {item.lastContact || "未連絡"}
          </p>
          {item.openTask && <p className="mt-0.5 text-mutedfg">次の対応: {item.openTask}</p>}
        </div>
        <ContactForm studentId={item.studentId} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
          {Object.entries(INTENT_LABELS).map(([k, v]) => <option key={k} value={k}>入学意思: {v}</option>)}
        </Select>
        <Input placeholder="志望大学" value={university} onChange={(e) => setUniversity(e.target.value)} />
        <Input placeholder="学部" value={faculty} onChange={(e) => setFaculty(e.target.value)} />
        <Input placeholder="支援方針" value={policy} onChange={(e) => setPolicy(e.target.value)} />
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-40"><RecorderField value={actingStaff} onChange={setActingStaff} /></div>
        <Button type="button" variant="primary" onClick={save}>保存</Button>
        {message && <span className={message === SAVED ? "text-mutedfg" : "text-red-600"}>{message}</span>}
      </div>
      {intent === "declined" && <p className="mt-1 text-amber-700">「辞退」で保存すると、このリストから外れます。</p>}
    </div>
  );
}
