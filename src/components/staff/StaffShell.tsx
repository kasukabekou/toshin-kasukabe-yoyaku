import Link from "next/link";
import { LogoutButton } from "@/app/staff/LogoutButton";

// 管理画面の共通枠：左にサイドメニュー、上に記入者とログアウト。
// href が無い項目は未実装（準備中）として表示のみ。
const ITEMS: { href?: string; label: string }[] = [
  { href: "/staff/visits", label: "来校・対応予定" },
  { href: "/staff/intake", label: "申込〜三者面談" },
  { href: "/staff/attack", label: "体験生アタックリスト" },
  { href: "/staff/events", label: "イベント進捗" },
  { href: "/staff/applications", label: "申込一覧(元データ)" },
];

export function StaffShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-border bg-surface md:w-56 md:border-b-0 md:border-r">
        <p className="px-4 py-4 text-sm font-semibold text-fg">春日部校 募集管理</p>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {ITEMS.map((i) =>
            i.href ? (
              <Link
                key={i.label}
                href={i.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active === i.href ? "bg-primary/10 font-semibold text-primary" : "text-fg hover:bg-subtle"}`}
              >
                {i.label}
              </Link>
            ) : (
              <span key={i.label} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-mutedfg/60">
                {i.label}
                <span className="ml-1 text-[10px]">準備中</span>
              </span>
            )
          )}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 bg-subtle/40">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface px-6 py-2.5">
          <LogoutButton />
        </header>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
