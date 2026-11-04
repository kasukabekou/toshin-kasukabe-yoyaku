import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteStudents } from "@/lib/manage/deleteStudents";
import { dbError, parseBody } from "@/lib/manage/server";

// 生徒の削除（1件・複数件）。記入者必須。元に戻せない。
const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  staffId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const r = await deleteStudents(body.data.ids, body.data.staffId);
  if ("error" in r) return dbError(r.error);
  return NextResponse.json(r);
}
