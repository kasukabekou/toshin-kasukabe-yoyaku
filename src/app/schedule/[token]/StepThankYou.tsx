import { Card, CardHeader } from "@/components/ui/primitives";
import type { ApplicationPattern } from "@/lib/types";

export function StepThankYou({ pattern }: { pattern: ApplicationPattern }) {
  return (
    <Card className="p-6 text-center">
      <CardHeader title="送信が完了しました" />
      <p className="mt-4 text-sm text-fg">ご入力ありがとうございました。</p>
      {pattern === "A" ? (
        <div className="mt-3 space-y-1 text-sm text-mutedfg">
          <p>当日、友人と一緒にご参加いただく場合は受付にてお知らせください。</p>
          <p>東進春日部校の公式LINEを友だち追加のうえ、お名前（漢字）を送信してください。</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-mutedfg">
          ご予約内容の確認メールをお送りします。ご不明点があれば校舎までお問い合わせください。
        </p>
      )}
    </Card>
  );
}
