import { EmptyState } from "@/components/ui/primitives";
import { PageShell } from "@/components/booking/PageShell";
import { resolveScheduleToken } from "@/lib/schedule/resolveToken";
import { BookingWizard } from "./BookingWizard";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveScheduleToken(token);

  return (
    <PageShell>
      {resolved ? (
        <BookingWizard application={resolved.application} token={token} alreadySubmitted={!!resolved.usedAt} />
      ) : (
        <EmptyState
          title="このURLはご利用いただけません"
          hint="リンクの有効期限が切れているか、URLが正しくない可能性があります。恐れ入りますが校舎までお問い合わせください。"
        />
      )}
    </PageShell>
  );
}
