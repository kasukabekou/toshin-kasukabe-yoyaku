import { redirect } from "next/navigation";

// /staff の入口。募集管理を使える環境（ローカル）は「申込〜三者面談」、公開環境は申込一覧へ。
export default function StaffIndex() {
  redirect(process.env.STAFF_MANAGEMENT_UI === "1" ? "/staff/intake" : "/staff/applications");
}
