import { StaffShell } from "@/components/staff/StaffShell";
import { NewStudentForm } from "./NewStudentForm";

export default function NewStudentPage() {
  return (
    <StaffShell active="/staff/intake">
      <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold text-fg">手動登録</h1>
      <p className="mb-4 text-sm text-mutedfg">電話・来校・紹介で受けた申込を登録します。氏名以外は未入力でも仮登録できます。</p>
      <NewStudentForm />
      </div>
    </StaffShell>
  );
}
