// テスト日程・面談候補の算出をステップ間で共有するための純関数群。
import {
  computeTestSession as computeTestSessionPure, splitSubjectsForDay, generateInterviewSlots, requiresTest,
  type TestSession, type InterviewSlot,
} from "@/lib/booking/logic";
import type { Application, BusyBlock, SubjectKey } from "@/lib/types";
import type { WizardState } from "./wizardReducer";

export interface TestPlan {
  day1: TestSession | null;
  overflowAfterDay1: SubjectKey[]; // 1日目に収まらなかった科目
  day2: TestSession | null;
  overflowAfterDay2: SubjectKey[]; // 2日目を指定してもなお収まらない科目（電話案内が必要）
}

// 1日目の枠に選択順で科目を詰め、あふれた科目があれば2日目（指定されていれば）で計算する。
export function computeTestPlan(application: Application, state: WizardState): TestPlan {
  const empty: TestPlan = { day1: null, overflowAfterDay1: [], day2: null, overflowAfterDay2: [] };
  if (!requiresTest(application.pattern) || !state.testStartDateISO || state.selectedSubjects.length === 0) {
    return empty;
  }
  const gradeGroup = application.gradeGroup ?? "g3";
  const date1 = new Date(state.testStartDateISO);
  const constraint1 = { arrivalHour: state.arrivalHour };
  const { fitting, overflow } = splitSubjectsForDay(state.selectedSubjects, gradeGroup, date1, constraint1);
  const day1 = computeTestSessionPure(date1, fitting, gradeGroup, constraint1);

  if (overflow.length === 0) {
    return { day1, overflowAfterDay1: [], day2: null, overflowAfterDay2: [] };
  }
  if (!state.testStartDate2ISO) {
    return { day1, overflowAfterDay1: overflow, day2: null, overflowAfterDay2: [] };
  }

  const date2 = new Date(state.testStartDate2ISO);
  const constraint2 = { arrivalHour: state.arrivalHour2 };
  const day2 = computeTestSessionPure(date2, overflow, gradeGroup, constraint2);
  return { day1, overflowAfterDay1: overflow, day2, overflowAfterDay2: day2 ? [] : overflow };
}

export function computeInterviewAfterDate(application: Application, state: WizardState): Date {
  const plan = computeTestPlan(application, state);
  const lastSession = plan.day2 ?? plan.day1;
  if (lastSession) return lastSession.endAt;
  const tomorrow = new Date(application.createdAt);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

export function computeInterviewSlots(application: Application, state: WizardState, busyBlocks: BusyBlock[]): InterviewSlot[] {
  const afterDate = computeInterviewAfterDate(application, state);
  return generateInterviewSlots(afterDate, busyBlocks, { daysToScan: 10 });
}
