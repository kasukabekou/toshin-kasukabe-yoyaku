"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, Field, Input, Select, Button } from "@/components/ui/primitives";
import { RAW_TYPE_LABELS } from "@/lib/booking/logic";
import type { ApplicationRawType, ApplicantRelation } from "@/lib/types";

const RAW_TYPE_OPTIONS = Object.keys(RAW_TYPE_LABELS) as ApplicationRawType[];
const GRADE_OPTIONS = ["高1", "高2", "高3"] as const;
const RELATION_OPTIONS: { value: ApplicantRelation; label: string }[] = [
  { value: "self", label: "本人" },
  { value: "parent", label: "保護者（母・父等）" },
  { value: "other", label: "その他" },
];

interface FormState {
  rawType: ApplicationRawType | "";
  name: string;
  nameKana: string;
  school: string;
  grade: (typeof GRADE_OPTIONS)[number] | "";
  email: string;
  phone: string;
  relation: ApplicantRelation | "";
  website: string; // ハニーポット。人間の目には触れない前提の欄で、値が入っていれば送信をBotとみなす。
}

const INITIAL: FormState = { rawType: "", name: "", nameKana: "", school: "", grade: "", email: "", phone: "", relation: "", website: "" };

export function StartApplicationForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSubmit =
    form.rawType !== "" &&
    form.name.trim().length > 0 &&
    form.nameKana.trim().length > 0 &&
    form.school.trim().length > 0 &&
    form.grade !== "" &&
    form.email.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.relation !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const emailInvalid = json?.detail?.fieldErrors?.email?.length > 0;
        setError(
          emailInvalid
            ? "メールアドレスの形式をご確認ください（例：taro@example.com）。"
            : "送信に失敗しました。入力内容をご確認のうえ、時間をおいて再度お試しください。"
        );
        setSubmitting(false);
        return;
      }
      const json = await res.json();
      router.push(`/schedule/${json.token}`);
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5">
      <CardHeader title="お申し込み情報のご入力" />
      <p className="mt-2 text-xs text-mutedfg">
        ご入力内容に応じて、この後の質問内容やご案内するお手続きが変わります。
      </p>
      <form onSubmit={handleSubmit}>
        {/* ハニーポット：CSSで画面上は非表示。スクリーンリーダーにも読ませないためaria-hiddenも付与。 */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
          <label>
            ウェブサイト
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="お申し込み種別">
            <Select required value={form.rawType} onChange={(e) => set("rawType", e.target.value as ApplicationRawType)}>
              <option value="">選択してください</option>
              {RAW_TYPE_OPTIONS.map((rt) => (
                <option key={rt} value={rt}>{RAW_TYPE_LABELS[rt]}</option>
              ))}
            </Select>
          </Field>
          <Field label="お名前（漢字）">
            <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="お名前（ふりがな）">
            <Input required value={form.nameKana} onChange={(e) => set("nameKana", e.target.value)} />
          </Field>
          <Field label="高校名">
            <Input required value={form.school} onChange={(e) => set("school", e.target.value)} />
          </Field>
          <Field label="学年">
            <Select required value={form.grade} onChange={(e) => set("grade", e.target.value as FormState["grade"])}>
              <option value="">選択してください</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="メールアドレス">
            <Input required type="email" placeholder="taro@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="電話番号（ご記入情報が不十分な場合、こちらにご連絡させていただくことがあります）">
            <Input required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="ご記入者様とのご関係">
            <Select required value={form.relation} onChange={(e) => set("relation", e.target.value as ApplicantRelation)}>
              <option value="">選択してください</option>
              {RELATION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-5 flex justify-end">
          <Button type="submit" variant="primary" disabled={!canSubmit || submitting}>
            {submitting ? "送信中…" : "次へ"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
