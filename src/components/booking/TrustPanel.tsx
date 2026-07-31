const ITEMS = [
  { title: "個人情報は厳重に管理します", desc: "ご入力いただいた情報は予約対応の目的以外には使用しません。" },
  { title: "無理な勧誘や営業は一切ありません", desc: "ご入力後にしつこい連絡をすることはございません。" },
  { title: "学習のプロが丁寧にサポートします", desc: "担当スタッフが一つひとつ確認のうえご案内します。" },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-primary">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10.2l2.6 2.6L14 7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrustPanel() {
  return (
    <div className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-8 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-fg">安心してご相談ください</p>
        <ul className="mt-4 space-y-4">
          {ITEMS.map((item) => (
            <li key={item.title} className="flex gap-2.5">
              <CheckIcon />
              <div>
                <p className="text-xs font-semibold text-fg">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mutedfg">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
