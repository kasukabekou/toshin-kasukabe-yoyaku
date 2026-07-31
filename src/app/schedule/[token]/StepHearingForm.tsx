"use client";
import { Card, CardHeader, Field, Textarea, Button } from "@/components/ui/primitives";
import { showsHearingItem8, HEARING_ITEM_LABELS, requiresTest } from "@/lib/booking/logic";
import type { Application } from "@/lib/types";
import type { HearingFormState, WizardAction } from "./wizardReducer";

const ITEM_KEYS = ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9"] as const;

export function StepHearingForm({
  application,
  hearing,
  dispatch,
}: {
  application: Application;
  hearing: HearingFormState;
  dispatch: (a: WizardAction) => void;
}) {
  const showItem8 = showsHearingItem8(application.pattern);
  const visibleKeys = ITEM_KEYS.filter((k) => k !== "item8" || showItem8);
  const canProceed = visibleKeys.every((k) => hearing[k].trim().length > 0);

  return (
    <Card className="p-5">
      <CardHeader title="お伺い（ヒアリング）" />
      <div className="mt-4 space-y-4">
        {visibleKeys.map((key) => (
          <Field key={key} label={HEARING_ITEM_LABELS[key]}>
            <Textarea
              rows={2}
              value={hearing[key]}
              onChange={(e) => dispatch({ type: "SET_HEARING_FIELD", key, value: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          variant="primary"
          disabled={!canProceed}
          onClick={() => dispatch({ type: "SET_STEP", step: requiresTest(application.pattern) ? "test" : "interview" })}
        >
          次へ
        </Button>
      </div>
    </Card>
  );
}
