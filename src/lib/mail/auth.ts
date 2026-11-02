import "server-only";
import { timingSafeEqual } from "node:crypto";

function same(given: string, expected: string | undefined): boolean {
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// メール取込系API（スタッフ認証の対象外）を、共有シークレットで保護する。
//  admin: 診断・予行演習・過去分の取込など。MAIL_INGEST_SECRET のみ。
//  cron : 外部の定期実行サービスに預ける、通常の取込と見張り専用。MAIL_CRON_SECRET でも通る。
//         外部に預ける値が漏れても、できるのは通常の取込（重複しない・メールを消さない）だけで、
//         診断や過去分の取込は実行できない。
export function mailSecretOk(request: Request, scope: "admin" | "cron" = "admin"): boolean {
  const given = request.headers.get("x-ingest-secret") ?? "";
  if (same(given, process.env.MAIL_INGEST_SECRET)) return true;
  return scope === "cron" && same(given, process.env.MAIL_CRON_SECRET);
}
