"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/staff/logout", { method: "POST" });
    router.push("/staff/login");
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={handleLogout}>
      ログアウト
    </Button>
  );
}
