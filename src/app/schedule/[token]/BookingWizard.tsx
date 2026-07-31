"use client";
import { useReducer } from "react";
import { EmptyState } from "@/components/ui/primitives";
import { StepProgress } from "@/components/booking/StepProgress";
import type { Application, ApplicationPattern } from "@/lib/types";
import { initialWizardState, wizardReducer, type StepKey } from "./wizardReducer";
import { StepHearingForm } from "./StepHearingForm";
import { StepPatternAForm } from "./StepPatternAForm";
import { StepTestPicker } from "./StepTestPicker";
import { StepInterviewPicker } from "./StepInterviewPicker";
import { StepConfirm } from "./StepConfirm";
import { StepThankYou } from "./StepThankYou";

function stepsForPattern(pattern: ApplicationPattern): { key: StepKey; label: string }[] {
  if (pattern === "A") {
    return [
      { key: "patternA", label: "情報入力" },
      { key: "done", label: "完了" },
    ];
  }
  if (pattern === "B") {
    return [
      { key: "hearing", label: "ヒアリング" },
      { key: "interview", label: "面談日時" },
      { key: "confirm", label: "確認" },
      { key: "done", label: "完了" },
    ];
  }
  return [
    { key: "hearing", label: "ヒアリング" },
    { key: "test", label: "テスト日時" },
    { key: "interview", label: "面談日時" },
    { key: "confirm", label: "確認" },
    { key: "done", label: "完了" },
  ];
}

export function BookingWizard({
  application,
  token,
  alreadySubmitted,
}: {
  application: Application;
  token: string;
  alreadySubmitted: boolean;
}) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    { pattern: application.pattern, gradeGroup: application.gradeGroup },
    ({ pattern, gradeGroup }) => initialWizardState(pattern, gradeGroup)
  );

  if (alreadySubmitted) {
    return (
      <div className="py-16">
        <EmptyState
          title="この申込は既に送信済みです"
          hint="内容の変更やご不明点がございましたら、校舎までお問い合わせください。"
        />
      </div>
    );
  }

  const steps = stepsForPattern(application.pattern);
  const currentIndex = steps.findIndex((s) => s.key === state.step);
  const previousStepKey = currentIndex > 0 ? steps[currentIndex - 1].key : null;
  const goBack = () => {
    if (previousStepKey) dispatch({ type: "SET_STEP", step: previousStepKey });
  };

  return (
    <div>
      {state.step !== "done" && <StepProgress labels={steps.map((s) => s.label)} currentIndex={currentIndex} />}

      {state.step === "patternA" && (
        <StepPatternAForm
          application={application}
          token={token}
          patternA={state.patternA}
          submitting={state.submitting}
          submitError={state.submitError}
          dispatch={dispatch}
        />
      )}
      {state.step === "hearing" && (
        <StepHearingForm application={application} hearing={state.hearing} dispatch={dispatch} />
      )}
      {state.step === "test" && <StepTestPicker application={application} state={state} dispatch={dispatch} onBack={goBack} />}
      {state.step === "interview" && <StepInterviewPicker application={application} state={state} dispatch={dispatch} onBack={goBack} />}
      {state.step === "confirm" && (
        <StepConfirm application={application} token={token} state={state} dispatch={dispatch} onBack={goBack} />
      )}
      {state.step === "done" && <StepThankYou pattern={application.pattern} />}
    </div>
  );
}
