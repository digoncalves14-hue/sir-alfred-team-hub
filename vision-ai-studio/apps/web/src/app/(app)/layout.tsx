import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <AppShell user={s.user} org={s.org}>
      {children}
    </AppShell>
  );
}
