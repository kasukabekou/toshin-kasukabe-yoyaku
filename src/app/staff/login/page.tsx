import { LoginForm } from "./LoginForm";

export default function StaffLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-lg font-semibold text-fg">スタッフログイン</h1>
      <p className="mb-6 text-sm text-mutedfg">校舎で共有しているアクセスコードを入力してください。</p>
      <LoginForm />
    </main>
  );
}
