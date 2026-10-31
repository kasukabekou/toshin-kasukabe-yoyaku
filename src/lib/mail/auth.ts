import "server-only";
import { timingSafeEqual } from "node:crypto";

// メール取込系API（スタッフ認証の対象外）を、共有シークレットで保護する。
export function mailSecretOk(request: Request): boolean {
  const expected = process.env.MAIL_INGEST_SECRET;
  const given = request.headers.get("x-ingest-secret") ?? "";
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
