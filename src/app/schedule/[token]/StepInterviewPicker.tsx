"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, Button, EmptyState } from "@/components/ui/primitives";
import { requiresTest } from "@/lib/booking/logic";
import type { Application, BusyBlock } from "@/lib/types";
import type { WizardState, WizardAction } from "./wizardReducer";
import { computeInterviewSlots } from "./deriveSchedule";

const HOSHINO_USER_ID = "usr_aoki"; // 星野（校舎長）
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function fmtDateTime(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StepInterviewPicker({
  application,
  state,
  dispatch,
  onBack,
}: {
  application: Application;
  state: WizardState;
  dispatch: (a: WizardAction) => void;
  onBack: () => void;
}) {
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schedule/busy-blocks?ownerId=${encodeURIComponent(HOSHINO_USER_ID)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setLoadError(json.error);
        else setBusyBlocks(json.busyBlocks ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("network_error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slots = useMemo(
    () => (busyBlocks ? computeInterviewSlots(application, state, busyBlocks) : []),
    [application, state, busyBlocks]
  );

  return (
    <Card className="p-5">
      <CardHeader title="初回三者面談の日時選択" />
      <p className="mt-2 text-xs text-mutedfg">
        {requiresTest(application.pattern)
          ? "学力診断テスト終了後、面談担当者の空き時間から候補を表示しています。"
          : "面談担当者の空き時間から候補を表示しています。"}
      </p>

      {loadError && (
        <EmptyState title="候補の取得に失敗しました" hint="時間をおいて再度お試しください。" />
      )}

      {!loadError && busyBlocks === null && (
        <p className="mt-4 text-sm text-mutedfg">読み込み中…</p>
      )}

      {!loadError && busyBlocks !== null && (
        <div className="mt-4 max-h-96 space-y-1.5 overflow-y-auto">
          {slots.length === 0 && (
            <EmptyState title="現在ご案内できる候補がありません" hint="お手数ですが校舎までお電話でお問い合わせください。" />
          )}
          {slots.map((slot, i) => (
            <button
              key={slot.startAt.toISOString()}
              onClick={() => dispatch({ type: "SET_INTERVIEW_SLOT", index: i })}
              className={
                "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                (state.interviewSlotIndex === i
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-surface hover:bg-subtle")
              }
            >
              {fmtDateTime(slot.startAt)} 〜 {fmtDateTime(slot.endAt).split("）")[1]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-between">
        <Button variant="secondary" showArrow={false} onClick={onBack}>戻る</Button>
        <Button
          variant="primary"
          disabled={state.interviewSlotIndex === null}
          onClick={() => dispatch({ type: "SET_STEP", step: "confirm" })}
        >
          次へ（内容の確認）
        </Button>
      </div>
    </Card>
  );
}
