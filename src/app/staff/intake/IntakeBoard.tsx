"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";
import { DeleteButton } from "@/components/staff/DeleteButton";
import { StaffSelect } from "@/components/staff/StaffSelect";
import { RecorderField, newClientId, postJson } from "@/components/staff/ActingStaff";
import { INTERVIEW_MINUTES } from "@/lib/booking/logic";
import { matchesFilter, type IntakeFilter, type StageState } from "@/lib/manage/intake";
import { CHANNEL_LABELS, CONTACT_RESULT_LABELS, FILTER_LABELS, MANAGE_TYPE_LABELS, STAGE_LABELS, fmtDate, fmtDateTime } from "@/lib/manage/labels";
import type { IntakeRow } from "@/lib/manage/loaders";

const TABS: IntakeFilter[] = ["all", "uncontacted", "no_answer", "test_unscheduled", "interview_unscheduled", "booked_pending", "absent", "history"];
const TAB_SHORT: Record<string, string> = { all: "すべて", booked_pending: "予約済・未実施", history: "完了" };

const TONE = {
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-sky-50 text-sky-700",
  gray: "bg-gray-100 text-gray-600",
} as const;

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}

function contactTone(c: string): keyof typeof TONE {
  return c === "no_answer" ? "red" : c === "connected" ? "green" : c === "callback_wait" ? "blue" : "gray";
}
function stageTone(s: StageState): keyof typeof TONE {
  return s === "unscheduled" ? "amber" : s === "booked" || s === "done" ? "green" : s === "absent" ? "red" : "gray";
}

function Stage({ state, at }: { state: StageState; at: string | null }) {
  return (
    <div className="space-y-0.5">
      {at && <p className="whitespace-nowrap text-xs text-fg">{fmtDateTime(at)}</p>}
      <Chip tone={stageTone(state)}>{state === "unscheduled" ? "日程未確定" : state === "na" ? "不要" : STAGE_LABELS[state]}</Chip>
    </div>
  );
}

// 申込日（日本時間の日付）が from〜to（yyyy-mm-dd、両端含む）に入るか
const jstDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const inRange = (iso: string, from: string, to: string) => {
  if (!from && !to) return true;
  const d = jstDay(iso);
  return (!from || d >= from) && (!to || d <= to);
};

export function IntakeBoard({ rows, staff, today }: { rows: IntakeRow[]; staff: { id: string; name: string }[]; today: string }) {
  const [tab, setTab] = useState<IntakeFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [rawType, setRawType] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const who = (id: string | null) => (id ? staffName.get(id) ?? "不明" : "—");

  const base = useMemo(() => {
    const k = keyword.trim();
    return rows.filter(
      (r) =>
        (!k || `${r.name}${r.nameKana}${r.school}`.includes(k)) &&
        (!rawType || r.rawType === rawType) &&
        (!grade || r.grade === grade) &&
        (!phone || r.status.contact === phone) &&
        (!channel || r.channel === channel) &&
        inRange(r.appliedAt, from, to)
    );
  }, [rows, keyword, rawType, grade, phone, channel, from, to]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, base.filter((r) => matchesFilter(r.status, t)).length])) as Record<IntakeFilter, number>, [base]);
  const shown = base.filter((r) => matchesFilter(r.status, tab));
  const selected = rows.find((r) => r.studentId === selectedId) ?? null;
  const rawTypes = [...new Set(rows.map((r) => r.rawType).filter(Boolean))];
  const grades = [...new Set(rows.map((r) => r.grade).filter(Boolean))].sort();
  const filtered = Boolean(keyword || rawType || grade || phone || channel || from || to);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${tab === t ? "bg-primary/10 font-semibold text-primary" : "text-mutedfg hover:bg-subtle"}`}
            >
              {TAB_SHORT[t] ?? FILTER_LABELS[t]}
              <span className={`rounded-full px-1.5 text-xs ${tab === t ? "bg-primary/15" : "bg-gray-100"}`}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3 text-xs">
          <label className="min-w-48 flex-1">
            <span className="mb-1 block text-mutedfg">キーワード</span>
            <Input placeholder="生徒名・学校名で検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">申込種別</span>
            <Select value={rawType} onChange={(e) => setRawType(e.target.value)}>
              <option value="">すべて</option>
              {rawTypes.map((t) => <option key={t} value={t}>{MANAGE_TYPE_LABELS[t] ?? t}</option>)}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">学年</span>
            <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">すべて</option>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">申込経路</span>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">すべて</option>
              <option value="mail">メール（Outlook取込）</option>
              <option value="form">フォーム</option>
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">申込日（から）</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">申込日（まで）</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-mutedfg">電話状況</span>
            <Select value={phone} onChange={(e) => setPhone(e.target.value)}>
              <option value="">すべて</option>
              {Object.entries(CONTACT_RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <Button type="button" variant="secondary" disabled={!filtered} onClick={() => { setKeyword(""); setRawType(""); setGrade(""); setPhone(""); setChannel(""); setFrom(""); setTo(""); }}>
            条件をクリア
          </Button>
        </div>

        {checked.size > 0 && (
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs">
            <span className="py-1 font-medium text-fg">{checked.size}件を選択中</span>
            <DeleteButton
              label="選択した生徒を削除"
              description={`選択した${checked.size}件の生徒と、紐づく申込・予約・連絡・次の対応・実績をすべて削除します。Googleカレンダーの予定は削除されません。`}
              url="/api/staff/manage/students/bulk-delete"
              method="POST"
              extraBody={{ ids: [...checked] }}
              onDone={() => { setChecked(new Set()); setSelectedId(null); }}
              className="rounded-lg bg-red-600 px-3 py-1 font-medium text-white"
            />
            <button type="button" className="py-1 text-mutedfg hover:underline" onClick={() => setChecked(new Set())}>選択を解除</button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-subtle text-xs text-mutedfg">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" aria-label="表示中をすべて選択" checked={shown.length > 0 && shown.every((r) => checked.has(r.studentId))} onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((r) => r.studentId)) : new Set())} />
                </th>
                {["生徒 / 申込種別", "電話状況", "学力テスト", "初回三者面談", "次の対応", "担当", "操作"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-mutedfg">該当する生徒はいません。</td></tr>
              )}
              {shown.map((r) => {
                const t = r.openTasks[0];
                const done = r.status.completed;
                return (
                  <tr
                    key={r.studentId}
                    onClick={() => setSelectedId(r.studentId)}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-subtle/60 ${selectedId === r.studentId ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`${r.name}を選択`} checked={checked.has(r.studentId)} onChange={() => toggle(r.studentId)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/staff/students/${r.studentId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-fg hover:text-primary hover:underline">
                        {r.name}
                      </Link>
                      <p className="text-xs text-mutedfg">
                        {r.grade} {MANAGE_TYPE_LABELS[r.rawType] ?? r.rawType}
                        <span className="ml-1 text-mutedfg/70">・{CHANNEL_LABELS[r.channel] ?? r.channel}・{fmtDate(r.appliedAt)}</span>
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tone={contactTone(r.status.contact)}>{CONTACT_RESULT_LABELS[r.status.contact]}</Chip>
                    </td>
                    <td className="px-3 py-2.5"><Stage state={r.status.test} at={r.test?.startAt ?? null} /></td>
                    <td className="px-3 py-2.5"><Stage state={r.status.interview} at={r.interview?.startAt ?? null} /></td>
                    <td className="px-3 py-2.5 text-xs">
                      {t ? (
                        <>
                          <p className="text-fg">{t.content}{r.openTasks.length > 1 ? <span className="text-mutedfg"> 他{r.openTasks.length - 1}件</span> : null}</p>
                          <p className={t.dueOn && t.dueOn < today ? "text-red-600" : "text-mutedfg"}>
                            {t.dueOn ? `${t.dueOn.slice(5).replace("-", "/")}${t.dueOn < today ? " 期限超過" : ""}` : "期限未設定"}
                          </p>
                        </>
                      ) : done ? (
                        <span className="text-mutedfg">—</span>
                      ) : (
                        <Chip tone="amber">未設定</Chip>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg">{who(t?.assignedStaffId ?? r.primaryStaffId)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedId(r.studentId); }}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${done ? "border border-border text-fg hover:bg-subtle" : "bg-primary text-white hover:opacity-90"}`}
                      >
                        {done ? "詳細" : "連絡・予約"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-mutedfg">{shown.length}件を表示（全{rows.length}件）。行をクリックすると右に操作パネルが開きます。</p>
      </div>

      <aside className="xl:sticky xl:top-4">
        {selected ? <ActionPanel key={selected.studentId} row={selected} /> : (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-mutedfg">
            左の一覧から生徒を選ぶと、連絡の記録と面談予約をここで行えます。
          </div>
        )}
      </aside>
    </div>
  );
}

// 右の操作パネル：連絡結果＋次の対応を保存、面談（テスト）の予約を入力する。
function ActionPanel({ row }: { row: IntakeRow }) {
  const router = useRouter();
  const [actingStaff, setActingStaff] = useState<string | null>(null);
  const contactId = useRef(newClientId());
  const apptId = useRef(newClientId());
  const [result, setResult] = useState("");
  const [memo, setMemo] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskStaff, setTaskStaff] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState("");
  const [kind, setKind] = useState<"interview" | "test">("interview");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(INTERVIEW_MINUTES);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const current = kind === "interview" ? row.interview : row.test;

  async function saveContact() {
    if (!actingStaff) return setMessage({ ok: false, text: "記入者を選択してください。" });
    if (!result && !taskContent) return setMessage({ ok: false, text: "連絡結果か次の対応を入力してください。" });
    setBusy(true);
    setMessage(null);
    // 連絡結果が未選択で次の対応だけ入力された場合は、手動の次の対応として登録する
    const r = result
      ? await postJson("/api/staff/manage/contact-logs", {
          clientId: contactId.current, studentId: row.studentId, result, content: memo, staffId: actingStaff,
          nextTask: taskContent ? { content: taskContent, assignedStaffId: taskStaff, dueOn: dueOn || null } : undefined,
        })
      : await postJson("/api/staff/manage/tasks", {
          clientId: contactId.current, studentId: row.studentId, staffId: actingStaff,
          task: { content: taskContent, assignedStaffId: taskStaff, dueOn: dueOn || null },
        });
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.message });
    contactId.current = newClientId();
    setResult(""); setMemo(""); setTaskContent(""); setDueOn("");
    setMessage({ ok: true, text: "記録を保存しました。" });
    router.refresh();
  }

  async function saveAppointment() {
    if (!actingStaff) return setMessage({ ok: false, text: "記入者を選択してください。" });
    if (!date || !time) return setMessage({ ok: false, text: "日付と時間を入力してください。" });
    const start = new Date(`${date}T${time}:00+09:00`);
    if (Number.isNaN(start.getTime())) return setMessage({ ok: false, text: "日時が正しくありません。" });
    setBusy(true);
    setMessage(null);
    const r = await postJson("/api/staff/manage/appointments", {
      clientId: apptId.current,
      studentId: row.studentId,
      applicationId: row.applicationId,
      kind,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + minutes * 60000).toISOString(),
      purpose: kind === "interview" ? "初回三者面談" : "学力診断テスト",
      assignedStaffId: assignee,
      replaceId: current?.id ?? null, // 既存の予約がある場合は日程変更として扱い、旧予約を履歴に残す
      staffId: actingStaff,
    });
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.message });
    apptId.current = newClientId();
    setDate(""); setTime("");
    setMessage({ ok: true, text: current ? "日程を変更しました（旧予約は履歴に残ります）。" : "予約を登録しました。" });
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-fg">{row.name}</h2>
        <p className="text-xs text-mutedfg">{row.school} {row.grade} ・ 連絡・日程調整</p>
        {row.lastContact && (
          <p className="mt-1 text-xs text-mutedfg">
            前回: {fmtDateTime(row.lastContact.contactedAt)} {CONTACT_RESULT_LABELS[row.lastContact.result]}
            {row.lastContact.content ? ` ・ ${row.lastContact.content}` : ""}
          </p>
        )}
      </div>

      <RecorderField value={actingStaff} onChange={setActingStaff} />

      <div className="space-y-2 border-t border-border pt-3">
        <Select value={result} onChange={(e) => setResult(e.target.value)} aria-label="連絡結果">
          <option value="">連絡結果を選択（記録しない）</option>
          <option value="no_answer">不通</option>
          <option value="connected">本人・保護者と接続</option>
          <option value="callback_wait">折返し待ち</option>
          <option value="other">その他</option>
        </Select>
        <Textarea rows={3} placeholder="連絡メモ" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <p className="pt-1 text-xs font-medium text-fg">次の対応</p>
        <Input placeholder="例: 時間を変えて再電話" value={taskContent} onChange={(e) => setTaskContent(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <StaffSelect value={taskStaff} onChange={setTaskStaff} placeholder="担当(未設定)" />
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} aria-label="期限" />
        </div>
        <Button type="button" variant="primary" className="w-full justify-center" disabled={busy} onClick={saveContact}>記録を保存</Button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-fg">予約</p>
        <Select value={kind} onChange={(e) => { const k = e.target.value as "interview" | "test"; setKind(k); setMinutes(k === "interview" ? INTERVIEW_MINUTES : 120); }}>
          <option value="interview">初回三者面談</option>
          <option value="test">学力診断テスト</option>
        </Select>
        {current && <p className="text-xs text-amber-700">現在の予約: {fmtDateTime(current.startAt)}（保存すると日程変更になります）</p>}
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="日付" />
          <Input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} aria-label="時間" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="所要時間">
            {[60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>{m}分</option>)}
          </Select>
          <StaffSelect value={assignee} onChange={setAssignee} placeholder="予定担当(未設定)" />
        </div>
        <Button type="button" variant="secondary" className="w-full justify-center" disabled={busy} onClick={saveAppointment}>
          {current ? "日程を変更する" : "予約を登録"}
        </Button>
      </div>

      {message && <p className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      <Link href={`/staff/students/${row.studentId}`} className="block text-xs text-primary hover:underline">生徒詳細を開く ›</Link>
    </div>
  );
}
