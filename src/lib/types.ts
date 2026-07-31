// ======================================================================
// 予約ページ（学力診断テスト・初回三者面談）— エンティティ型定義
// Work With OS とは別アプリ。DBは同じSupabaseプロジェクトを共有（schedule_ プレフィックスのテーブル群）。
// ======================================================================

export type ID = string;
export type ISODate = string;

export type ApplicationRawType =
  | "special_invite" // 特別招待講習
  | "document_request" // 資料請求
  | "briefing" // 個別説明会
  | "school_course_briefing" // 高校対応別指導コース個別説明会
  | "open_class" // 特別公開授業
  | "trial_day" // 1日体験
  | "week_intensive_trial"; // 1週間集中体験

export type ApplicationPattern = "A" | "B" | "C";
export type GradeGroup = "g3" | "g12";
export type ApplicantRelation = "self" | "parent" | "other";

export interface Application {
  id: ID;
  pattern: ApplicationPattern;
  rawType: ApplicationRawType;
  name: string;
  nameKana: string;
  school: string;
  grade: string;
  email: string;
  phone: string;
  relation: ApplicantRelation;
  gradeGroup: GradeGroup | null; // パターンA（特別公開授業）は null
  arrivalConstraintNote: string | null;
  createdAt: ISODate;
}

// 標準ヒアリング項目①〜⑨（パターンB・Cで使用。パターンBは item8 を空文字にする）
export interface HearingAnswers {
  id: ID;
  applicationId: ID;
  item1: string;
  item2: string;
  item3: string;
  item4: string;
  item5: string;
  item6: string;
  item7: string;
  item8: string;
  item9: string;
  createdAt: ISODate;
}

// パターンA（特別公開授業）専用のフォーム項目
// 氏名・ふりがな・連絡先は共通の申込ステップ（Application）で既に取得済みのためここには含めない
export interface PatternAAnswers {
  id: ID;
  applicationId: ID;
  currentPathHope: string;
  desiredUniversity: string;
  desiredFaculty: string;
  referrerStudentName: string;
  bringFriend: boolean;
  createdAt: ISODate;
}

export type SubjectKeyG3 =
  | "kokugo" | "math1a" | "math2bc" | "eigo_reading"
  | "physics" | "chemistry" | "biology" | "earth_science"
  | "japanese_history" | "world_history" | "geography" | "ethics_politics";

export type SubjectKeyG12 = "kokugo_g12" | "math_g12" | "eigo_g12";

export type SubjectKey = SubjectKeyG3 | SubjectKeyG12;

export interface TestSubjectSelection {
  id: ID;
  applicationId: ID;
  subjectKey: SubjectKey;
  order: number;
}

export type AppointmentKind = "test" | "interview";

export interface Appointment {
  id: ID;
  applicationId: ID;
  kind: AppointmentKind;
  startAt: ISODate;
  endAt: ISODate;
  dayIndex: number;
}

export interface ScheduleTokenRecord {
  id: ID;
  applicationId: ID;
  token: string;
  expiresAt: ISODate;
  usedAt: ISODate | null;
}

// 星野カレンダーのbusy情報（初回三者面談の空き判定にのみ使用）
export interface BusyBlock {
  id: ID;
  ownerId: ID;
  startAt: ISODate;
  endAt: ISODate;
  label: string;
}
