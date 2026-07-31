"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, Button } from "@/components/ui/primitives";
import { SUBJECT_LABELS, requiresTest, HEARING_ITEM_LABELS } from "@/lib/booking/logic";
import type { Application, BusyBlock } from "@/lib/types";
import type { WizardState, WizardAction } from "./wizardReducer";
import { computeTestPlan, computeInterviewSlots } from "./deriveSchedule";

const HOSHINO_USER_ID = "usr_aoki";
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDateTime(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StepConfirm({
  application,
  token,
  state,
  dispatch,
  onBack,
}: {
  application: Application;
  token: string;
  state: WizardState;
  dispatch: (a: WizardAction) => void;
  onBack: () => void;
}) {
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schedule/busy-blocks?ownerId=${encodeURIComponent(HOSHINO_USER_ID)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && !json.error) setBusyBlocks(json.busyBlocks ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const testPlan = useMemo(() => computeTestPlan(application, state), [application, state]);
  const interviewSlots = useMemo(() => computeInterviewSlots(application, state, busyBlocks), [application, state, busyBlocks]);
  const chosenInterviewSlot = state.interviewSlotIndex !== null ? interviewSlots[state.interviewSlotIndex] : null;

  async function handleConfirm() {
    dispatch({ type: "SUBMIT_START" });
    try {
      const res = await fetch("/api/schedule/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          hearing: state.hearing,
          selectedSubjects: requiresTest(application.pattern) ? state.selectedSubjects : [],
          testSegments: [
            ...(testPlan.day1 ? [{ startAt: testPlan.day1.startAt.toISOString(), endAt: testPlan.day1.endAt.toISOString(), dayIndex: 0 }] : []),
            ...(testPlan.day2 ? [{ startAt: testPlan.day2.startAt.toISOString(), endAt: testPlan.day2.endAt.toISOString(), dayIndex: 1 }] : []),
          ],
          interviewSlot: chosenInterviewSlot
            ? { startAt: chosenInterviewSlot.startAt.toISOString(), endAt: chosenInterviewSlot.endAt.toISOString() }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message =
          json.error === "already_submitted"
            ? "この申込は既に送信済みです。"
            : json.error === "interview_slot_taken"
            ? "選択された面談枠は、たった今別の方が確定されました。お手数ですが「戻る」から別の日時を選び直してください。"
            : "送信に失敗しました。時間をおいて再度お試しください。";
        dispatch({ type: "SUBMIT_ERROR", message });
        return;
      }
      dispatch({ type: "SET_STEP", step: "done" });
    } catch {
      dispatch({ type: "SUBMIT_ERROR", message: "通信エラーが発生しました。時間をおいて再度お試しください。" });
    }
  }

  return (
    <Card className="p-5">
      <CardHeader title="ご入力内容の確認" />
      <div className="mt-4 space-y-4 text-sm">
        <section>
          <h3 className="mb-1 text-xs font-semibold text-mutedfg">ヒアリング内容</h3>
          <dl className="space-y-1">
            {(Object.keys(state.hearing) as (keyof typeof state.hearing)[])
              .filter((k) => state.hearing[k].trim().length > 0)
              .map((k) => (
                <div key={k}>
                  <dt className="text-xs text-mutedfg">{HEARING_ITEM_LABELS[k]}</dt>
                  <dd className="text-fg">{state.hearing[k]}</dd>
                </div>
              ))}
          </dl>
        </section>

        {testPlan.day1 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold text-mutedfg">学力診断テスト</h3>
            <p className="text-fg">
              受験科目：{state.selectedSubjects.map((k) => SUBJECT_LABELS[k]).join("・")}
            </p>
            <p className="text-fg">
              {fmtDateTime(testPlan.day1.startAt)}〜{testPlan.day1.endAt.getHours()}:{String(testPlan.day1.endAt.getMinutes()).padStart(2, "0")}
              {testPlan.day2 && "（1日目）"}
            </p>
            {testPlan.day2 && (
              <p className="text-fg">
                {fmtDateTime(testPlan.day2.startAt)}〜{testPlan.day2.endAt.getHours()}:{String(testPlan.day2.endAt.getMinutes()).padStart(2, "0")}（2日目）
              </p>
            )}
          </section>
        )}

        {chosenInterviewSlot && (
          <section>
            <h3 className="mb-1 text-xs font-semibold text-mutedfg">初回三者面談</h3>
            <p className="text-fg">
              {fmtDateTime(chosenInterviewSlot.startAt)}〜{chosenInterviewSlot.endAt.getHours()}:{String(chosenInterviewSlot.endAt.getMinutes()).padStart(2, "0")}
            </p>
          </section>
        )}
      </div>

      {state.submitError && <p className="mt-3 text-xs text-danger">{state.submitError}</p>}

      <div className="mt-5 flex justify-between">
        <Button variant="secondary" showArrow={false} onClick={onBack}>戻る</Button>
        <Button variant="primary" disabled={state.submitting} onClick={handleConfirm}>
          {state.submitting ? "送信中…" : "この内容で予約を確定する"}
        </Button>
      </div>
    </Card>
  );
}
