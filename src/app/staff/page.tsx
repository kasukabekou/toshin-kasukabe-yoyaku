import { redirect } from "next/navigation";

// 管理画面のトップは「申込〜三者面談」。旧URL(/staff)のブックマークやログイン後の遷移を受ける。
export default function StaffIndex() {
  redirect("/staff/intake");
}
