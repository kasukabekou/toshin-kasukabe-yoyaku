"use client";
import { useMemo } from "react";
import { Card, CardHeader, Field, Select, Button } from "@/components/ui/primitives";
import {
  SUBJECT_LABELS, subjectMinutes, totalTestMinutes,
  recommendBaseSubjects, recommendRikaCount, COURSE_TYPE_LABELS, isClosedDate,
} from "@/lib/booking/logic";
import type { CourseType } from "@/lib/booking/logic";
import type { Application, SubjectKeyG3 } from "@/lib/types";
import type { WizardState, WizardAction } from "./wizardReducer";
import { computeTestPlan } from "./deriveSchedule";

const SHAKAI_KEYS: SubjectKeyG3[] = ["japanese_history", "world_history", "geography", "ethics_politics"];
const RIKA_KEYS: SubjectKeyG3[] = ["physics", "chemistry", "biology", "earth_science"];
const COURSE_TYPES = Object.keys(COURSE_TYPE_LABELS) as CourseType[];
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const ARRIVAL_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function candidateDates(base: Date, fromDay: number, count: number): Date[] {
  const days: Date[] = [];
  let offset = fromDay;
  while (days.length < count && offset < fromDay + count * 3) {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    if (!isClosedDate(d)) days.push(d);
    offset++;
  }
  return days;
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）`;
}

function fmtTime(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StepTestPicker({
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
  const isG3 = application.gradeGroup === "g3";
  const gradeGroup = application.gradeGroup ?? "g3";
  const baseDate = useMemo(() => new Date(application.createdAt), [application.createdAt]);
  const dates1 = useMemo(() => candidateDates(baseDate, 1, 8), [baseDate]);

  const rec = state.courseType ? recommendBaseSubjects(state.courseType) : null;
  const isRikei = state.courseType === "private_rikei" || state.courseType === "national_rikei";
  const rikaCount = state.courseType ? recommendRikaCount(state.courseType, { aimsTopPrivate: state.aimsTopPrivate, halfOrMoreCovered: state.halfOrMoreCovered }) : 0;

  const selectedRikaCount = state.selectedSubjects.filter((k) => (RIKA_KEYS as string[]).includes(k)).length;
  const selectedShakaiCount = state.selectedSubjects.filter((k) => (SHAKAI_KEYS as string[]).includes(k)).length;

  const plan = useMemo(() => computeTestPlan(application, state), [application, state]);
  const subjectSum = subjectMinutes(gradeGroup, state.selectedSubjects);
  const total = totalTestMinutes(subjectSum, state.selectedSubjects.length);

  const date2Base = plan.day1 ? plan.day1.date : baseDate;
  const dates2 = useMemo(() => candidateDates(date2Base, 1, 8), [date2Base]);

  const needsDay2Input = plan.overflowAfterDay1.length > 0 && !state.testStartDate2ISO;
  const stillOverflowing = plan.overflowAfterDay2.length > 0;

  const canProceed =
    (!isG3 || !!state.courseType) &&
    state.selectedSubjects.length > 0 &&
    !!plan.day1 &&
    !needsDay2Input &&
    !stillOverflowing &&
    (!rec?.needsShakai || selectedShakaiCount >= 1) &&
    (rikaCount === 0 || selectedRikaCount >= 1);

  return (
    <Card className="p-5">
      <CardHeader title="学力診断テストの受験科目・日時" />
      <div className="mt-2 space-y-2 text-xs text-mutedfg">
        <p>
          学力診断テストは、現在の学力を科目・分野ごとに客観的に把握し、今後の学習計画や学習方針を考えるためのテストです。
        </p>
        {isG3 ? (
          <p>
            東進が独自に作成している「共通テスト本番レベル模試」を使用します。
            共通テストと同じ形式の問題に取り組み、各科目・分野の得意不得意や、志望校合格に向けた現在の到達度を分析します。結果をもとに、今後優先して取り組むべき学習内容やスケジュールをご提案します。
          </p>
        ) : (
          <p>
            教科書レベルの基礎問題から応用問題まで、現在どの程度理解できているかを確認します。
            得意な分野や、これから重点的に学習する必要がある分野を明確にし、今後の学習計画を立てるために活用します。
          </p>
        )}
      </div>
      <div className="mt-4 space-y-5">
        {isG3 ? (
          <>
            <Field label="志望校区分">
              <Select
                value={state.courseType ?? ""}
                onChange={(e) => dispatch({ type: "SET_COURSE_TYPE", courseType: e.target.value as CourseType })}
              >
                <option value="">選択してください</option>
                {COURSE_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{COURSE_TYPE_LABELS[ct]}</option>
                ))}
              </Select>
            </Field>

            {isRikei && (
              <div className="space-y-2 rounded-lg border border-border bg-subtle p-3 text-sm">
                {state.courseType === "private_rikei" && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.aimsTopPrivate}
                      onChange={(e) => dispatch({ type: "SET_AIMS_TOP_PRIVATE", value: e.target.checked })}
                    />
                    早慶以上のレベルを目指している
                  </label>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={state.halfOrMoreCovered}
                    onChange={(e) => dispatch({ type: "SET_HALF_OR_MORE_COVERED", value: e.target.checked })}
                  />
                  理科の授業が学校で半分以上進んでいる
                </label>
                <p className="text-[11px] text-mutedfg">理科の推奨受験科目数：{rikaCount}科目</p>
              </div>
            )}

            {rec && (
              <Field label="受験科目（志望校区分から自動選択。追加・解除できます）">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {rec.fixed.map((key) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-sm">
                      <input type="checkbox" checked disabled />
                      {SUBJECT_LABELS[key]}
                    </label>
                  ))}
                </div>
              </Field>
            )}

            {rec?.needsShakai && (
              <Field label="社会（1科目選んでください）">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SHAKAI_KEYS.map((key) => {
                    const checked = state.selectedSubjects.includes(key);
                    const disabled = !checked && selectedShakaiCount >= 1;
                    return (
                      <label key={key} className={"flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm" + (disabled ? " opacity-40" : "")}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => dispatch({ type: "TOGGLE_SUBJECT", key })} />
                        {SUBJECT_LABELS[key]}
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}

            {rikaCount > 0 && (
              <Field label={`理科（${rikaCount}科目選んでください。学校で半分以上履修済みの科目を選んでください）`}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {RIKA_KEYS.map((key) => {
                    const checked = state.selectedSubjects.includes(key);
                    const disabled = !checked && selectedRikaCount >= rikaCount;
                    return (
                      <label key={key} className={"flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm" + (disabled ? " opacity-40" : "")}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => dispatch({ type: "TOGGLE_SUBJECT", key })} />
                        {SUBJECT_LABELS[key]}
                      </label>
                    );
                  })}
                </div>
              </Field>
            )}
          </>
        ) : (
          <Field label="受験科目（固定・基礎学力テスト）">
            <p className="text-sm text-fg">国語・数学・英語</p>
          </Field>
        )}

        <div className="text-xs text-mutedfg">
          科目合計 {subjectSum}分 ／ 総所要時間（カウンセリング15分・休憩含む） {total}分
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="ご希望の受験日（1日目）">
            <Select value={state.testStartDateISO ?? ""} onChange={(e) => dispatch({ type: "SET_TEST_START_DATE", dateISO: e.target.value })}>
              <option value="">選択してください</option>
              {dates1.map((d) => (
                <option key={d.toISOString()} value={d.toISOString()}>{fmtDate(d)}</option>
              ))}
            </Select>
          </Field>
          <Field label="その日は何時から来校できますか">
            <Select value={state.arrivalHour} onChange={(e) => dispatch({ type: "SET_ARRIVAL_HOUR", hour: Number(e.target.value) })}>
              {ARRIVAL_HOURS.map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </Select>
          </Field>
        </div>

        {plan.day1 && (
          <div className="rounded-lg border border-border bg-subtle p-3 text-sm">
            <p className="mb-1 font-medium text-fg">
              {plan.overflowAfterDay1.length > 0 ? "1日目の受験日程（自動計算）" : "受験日程（自動計算）"}
            </p>
            <p className="text-mutedfg">{fmtDate(plan.day1.date)}：{fmtTime(plan.day1.startAt)}〜{fmtTime(plan.day1.endAt)}</p>
          </div>
        )}

        {plan.overflowAfterDay1.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-subtle p-3">
            <p className="text-xs text-fg">
              1日目だけでは収まりません。あふれた科目（{plan.overflowAfterDay1.map((k) => SUBJECT_LABELS[k]).join("・")}）は2日目の日程をご指定ください。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="2日目の受験日">
                <Select value={state.testStartDate2ISO ?? ""} onChange={(e) => dispatch({ type: "SET_TEST_START_DATE_2", dateISO: e.target.value })}>
                  <option value="">選択してください</option>
                  {dates2.map((d) => (
                    <option key={d.toISOString()} value={d.toISOString()}>{fmtDate(d)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="その日は何時から来校できますか">
                <Select value={state.arrivalHour2} onChange={(e) => dispatch({ type: "SET_ARRIVAL_HOUR_2", hour: Number(e.target.value) })}>
                  {ARRIVAL_HOURS.map((h) => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </Select>
              </Field>
            </div>
            {plan.day2 && (
              <p className="text-sm text-mutedfg">
                2日目の受験日程：{fmtDate(plan.day2.date)}：{fmtTime(plan.day2.startAt)}〜{fmtTime(plan.day2.endAt)}
              </p>
            )}
            {stillOverflowing && (
              <p className="text-xs text-danger">
                2日目でも収まりません。お手数ですが校舎までお電話ください。
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="secondary" showArrow={false} onClick={onBack}>戻る</Button>
        <Button variant="primary" disabled={!canProceed} onClick={() => dispatch({ type: "SET_STEP", step: "interview" })}>
          次へ（面談日時の選択）
        </Button>
      </div>
    </Card>
  );
}
