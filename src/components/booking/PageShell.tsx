import { TrustPanel } from "./TrustPanel";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 pb-16">
      <div className="mx-auto max-w-4xl pt-8">
        <div className="mb-8 text-center">
          <p className="text-2xl font-extrabold tracking-wide text-primary">東進</p>
          <h1 className="mt-1 text-lg font-bold text-fg">東進ハイスクール春日部校</h1>
          <p className="mt-1 text-xs text-mutedfg">学力診断テスト・初回三者面談 予約フォーム</p>
        </div>

        <div className="flex items-start justify-center gap-6">
          <div className="w-full max-w-xl">{children}</div>
          <TrustPanel />
        </div>
      </div>
    </div>
  );
}
