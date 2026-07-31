import "server-only";
import { supabaseAdmin } from "../supabase/adminClient";
import { applicationFromRow } from "./rows";
import type { Application, ID } from "../types";

export interface ResolvedSchedule {
  applicationId: ID;
  application: Application;
  usedAt: string | null;
}

export async function resolveScheduleToken(token: string): Promise<ResolvedSchedule | null> {
  const { data: tokenRow } = await supabaseAdmin
    .from("schedule_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return null;
  if (new Date(tokenRow.expires_at as string).getTime() < Date.now()) return null;

  const { data: appRow } = await supabaseAdmin
    .from("schedule_applications")
    .select("*")
    .eq("id", tokenRow.application_id)
    .maybeSingle();
  if (!appRow) return null;

  return {
    applicationId: tokenRow.application_id as string,
    application: applicationFromRow(appRow),
    usedAt: (tokenRow.used_at as string | null) ?? null,
  };
}
