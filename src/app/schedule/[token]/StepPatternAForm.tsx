"use client";
import { Card, CardHeader, Field, Input, Button } from "@/components/ui/primitives";
import type { Application } from "@/lib/types";
import type { PatternAFormState, WizardAction, WizardState } from "./wizardReducer";

export function StepPatternAForm({
  application,
  token,
  patternA,
  submitting,
  submitError,
  dispatch,
}: {
  application: Application;
  token: string;
  patternA: PatternAFormState;
  submitting: WizardState["submitting"];
  submitError: WizardState["submitError"];
  dispatch: (a: WizardAction) => void;
}) {
  const canProceed = patternA.currentPathHope.trim().length > 0;

  async function handleSubmit() {
    dispatch({ type: "SUBMIT_START" });
    try {
      const res = await fetch("/api/schedule/submit-pattern-a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, patternA }),
      });
      const json = await res.json();
      if (!res.ok) {
        dispatch({ type: "SUBMIT_ERROR", message: json.error === "already_submitted" ? "この申込は既に送信済みです。" : "送信に失敗しました。時間をおいて再度お試しください。" });
        return;
      }
      dispatch({ type: "SET_STEP", step: "done" });
    } catch {
      dispatch({ type: "SUBMIT_ERROR", message: "通信エラーが発生しました。時間をおいて再度お試しください。" });
    }
  }

  return (
    <Card className="p-5">
      <CardHeader title="特別公開授業 お申し込み情報のご確認" />
      <p className="mt-2 text-xs text-mutedfg">
        {application.name} 様、ご参加ありがとうございます。当日に向けて以下をご入力ください。
      </p>
      <div className="mt-4 space-y-4">
        <Field label="現在の進路希望（文系/理系/未定）">
          <Input value={patternA.currentPathHope} onChange={(e) => dispatch({ type: "SET_PATTERN_A_FIELD", key: "currentPathHope", value: e.target.value })} />
        </Field>
        <Field label="現在の志望校">
          <Input value={patternA.desiredUniversity} onChange={(e) => dispatch({ type: "SET_PATTERN_A_FIELD", key: "desiredUniversity", value: e.target.value })} />
        </Field>
        <Field label="現在の志望学部">
          <Input value={patternA.desiredFaculty} onChange={(e) => dispatch({ type: "SET_PATTERN_A_FIELD", key: "desiredFaculty", value: e.target.value })} />
        </Field>
        <Field label="生徒紹介者名（東進生からの紹介の場合）">
          <Input value={patternA.referrerStudentName} onChange={(e) => dispatch({ type: "SET_PATTERN_A_FIELD", key: "referrerStudentName", value: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={patternA.bringFriend}
            onChange={(e) => dispatch({ type: "SET_PATTERN_A_FIELD", key: "bringFriend", value: e.target.checked })}
          />
          友人と一緒に参加する
        </label>
      </div>
      {submitError && <p className="mt-3 text-xs text-danger">{submitError}</p>}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" disabled={!canProceed || submitting} onClick={handleSubmit}>
          {submitting ? "送信中…" : "送信する"}
        </Button>
      </div>
    </Card>
  );
}
