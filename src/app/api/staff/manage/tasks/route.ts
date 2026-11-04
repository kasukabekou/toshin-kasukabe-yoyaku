import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, createTaskFromRecord, dbError, nextTaskSchema, parseBody } from "@/lib/manage/server";

const schema = z.object({
  clientId: z.string().min(1).max(100),
  studentId: z.string().min(1),
  enrollmentId: z.string().nullable().optional(),
  staffId: z.string().nullable().optional(),
  task: nextTaskSchema,
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const err = await createTaskFromRecord({ studentId: d.studentId, enrollmentId: d.enrollmentId, sourceType: "manual", sourceId: d.clientId, task: d.task });
  if (err) return dbError(err.message);
  await audit("schedule_tasks", `manual:${d.clientId}`, "insert", d.staffId);
  return NextResponse.json({ ok: true });
}
