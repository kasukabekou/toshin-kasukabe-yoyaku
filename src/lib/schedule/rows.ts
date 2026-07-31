import "server-only";
// Supabase の行（snake_case）とアプリのエンティティ（camelCase）の変換。
// テーブル数が少ないため、汎用変換ではなくテーブルごとに明示的に書く。
import type { Application, BusyBlock } from "../types";

export function applicationFromRow(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    pattern: row.pattern as Application["pattern"],
    rawType: row.raw_type as Application["rawType"],
    name: row.name as string,
    nameKana: (row.name_kana as string | null) ?? "",
    school: row.school as string,
    grade: row.grade as string,
    email: row.email as string,
    phone: row.phone as string,
    relation: row.relation as Application["relation"],
    gradeGroup: (row.grade_group as Application["gradeGroup"]) ?? null,
    arrivalConstraintNote: (row.arrival_constraint_note as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function busyBlockFromRow(row: Record<string, unknown>): BusyBlock {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    label: row.label as string,
  };
}
