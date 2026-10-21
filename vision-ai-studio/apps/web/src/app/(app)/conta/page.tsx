import { requireSession } from "@/lib/session";
import { AccountForm } from "./AccountForm";

export const metadata = { title: "Minha conta" };

export default async function Page() {
  const s = await requireSession();
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold">Minha conta</h1>
      <div className="panel mt-6 space-y-1 p-5 text-sm">
        <p className="text-neutral-200">{s.user.name}</p>
        <p className="text-neutral-400">{s.user.email}</p>
        <p className="text-xs text-neutral-500">{s.org.name}</p>
      </div>
      <AccountForm />
    </div>
  );
}
