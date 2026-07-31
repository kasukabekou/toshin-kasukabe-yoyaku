import type { GradeGroup, SubjectKey, SubjectKeyG3, ApplicationPattern } from "@/lib/types";
import { recommendBaseSubjects, type CourseType } from "@/lib/booking/logic";

export type StepKey = "hearing" | "patternA" | "test" | "interview" | "confirm" | "done";

export interface HearingFormState {
  item1: string; item2: string; item3: string; item4: string; item5: string;
  item6: string; item7: string; item8: string; item9: string;
}

// 氏名・ふりがな・連絡先は申込ステップ（Application）側で既に確定しているためここには含めない
export interface PatternAFormState {
  currentPathHope: string;
  desiredUniversity: string;
  desiredFaculty: string;
  referrerStudentName: string;
  bringFriend: boolean;
}

export interface WizardState {
  step: StepKey;
  hearing: HearingFormState;
  patternA: PatternAFormState;
  courseType: CourseType | null; // 志望校区分（g3のみ）
  aimsTopPrivate: boolean; // 早慶以上を目指しているか（私立理系のみ判定に使用）
  halfOrMoreCovered: boolean; // 理科の履修が半分以上進んでいるか
  selectedSubjects: SubjectKey[];
  testStartDateISO: string | null; // 1日目の受験日 "YYYY-MM-DD"
  arrivalHour: number; // 1日目の来校可能時刻
  testStartDate2ISO: string | null; // 2日目の受験日（1日目に収まらない科目がある場合のみ使用）
  arrivalHour2: number; // 2日目の来校可能時刻
  interviewSlotIndex: number | null;
  submitting: boolean;
  submitError: string | null;
}

const FIXED_G12_SUBJECTS: SubjectKey[] = ["kokugo_g12", "math_g12", "eigo_g12"];

export function initialWizardState(pattern: ApplicationPattern, gradeGroup: GradeGroup | null): WizardState {
  return {
    step: pattern === "A" ? "patternA" : "hearing",
    hearing: { item1: "", item2: "", item3: "", item4: "", item5: "", item6: "", item7: "", item8: "", item9: "" },
    patternA: {
      currentPathHope: "", desiredUniversity: "", desiredFaculty: "", referrerStudentName: "", bringFriend: false,
    },
    courseType: null,
    aimsTopPrivate: false,
    halfOrMoreCovered: false,
    selectedSubjects: gradeGroup === "g12" ? FIXED_G12_SUBJECTS : [],
    testStartDateISO: null,
    arrivalHour: 10,
    testStartDate2ISO: null,
    arrivalHour2: 10,
    interviewSlotIndex: null,
    submitting: false,
    submitError: null,
  };
}

export type WizardAction =
  | { type: "SET_STEP"; step: StepKey }
  | { type: "SET_HEARING_FIELD"; key: keyof HearingFormState; value: string }
  | { type: "SET_PATTERN_A_FIELD"; key: keyof PatternAFormState; value: string | boolean }
  | { type: "SET_COURSE_TYPE"; courseType: CourseType }
  | { type: "SET_AIMS_TOP_PRIVATE"; value: boolean }
  | { type: "SET_HALF_OR_MORE_COVERED"; value: boolean }
  | { type: "TOGGLE_SUBJECT"; key: SubjectKeyG3 }
  | { type: "SET_TEST_START_DATE"; dateISO: string }
  | { type: "SET_ARRIVAL_HOUR"; hour: number }
  | { type: "SET_TEST_START_DATE_2"; dateISO: string }
  | { type: "SET_ARRIVAL_HOUR_2"; hour: number }
  | { type: "SET_INTERVIEW_SLOT"; index: number }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_ERROR"; message: string };

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_HEARING_FIELD":
      return { ...state, hearing: { ...state.hearing, [action.key]: action.value } };
    case "SET_PATTERN_A_FIELD":
      return { ...state, patternA: { ...state.patternA, [action.key]: action.value } };
    case "SET_COURSE_TYPE": {
      const rec = recommendBaseSubjects(action.courseType);
      return { ...state, courseType: action.courseType, selectedSubjects: [...rec.fixed] };
    }
    case "SET_AIMS_TOP_PRIVATE":
      return { ...state, aimsTopPrivate: action.value };
    case "SET_HALF_OR_MORE_COVERED":
      return { ...state, halfOrMoreCovered: action.value };
    case "TOGGLE_SUBJECT": {
      const exists = state.selectedSubjects.includes(action.key);
      return {
        ...state,
        selectedSubjects: exists
          ? state.selectedSubjects.filter((k) => k !== action.key)
          : [...state.selectedSubjects, action.key],
      };
    }
    case "SET_TEST_START_DATE":
      return { ...state, testStartDateISO: action.dateISO, interviewSlotIndex: null };
    case "SET_ARRIVAL_HOUR":
      return { ...state, arrivalHour: action.hour, interviewSlotIndex: null };
    case "SET_TEST_START_DATE_2":
      return { ...state, testStartDate2ISO: action.dateISO, interviewSlotIndex: null };
    case "SET_ARRIVAL_HOUR_2":
      return { ...state, arrivalHour2: action.hour, interviewSlotIndex: null };
    case "SET_INTERVIEW_SLOT":
      return { ...state, interviewSlotIndex: action.index };
    case "SUBMIT_START":
      return { ...state, submitting: true, submitError: null };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, submitError: action.message };
    default:
      return state;
  }
}
