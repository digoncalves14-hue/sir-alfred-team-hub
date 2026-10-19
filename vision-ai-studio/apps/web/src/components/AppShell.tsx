"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, Download, FolderKanban, Gem, Home, Images, LayoutTemplate, LogOut, Plus, Scissors } from "lucide-react";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/client";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/biblioteca", label: "Biblioteca", icon: Images },
  { href: "/marcas", label: "Minhas Marcas", icon: Gem },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/exportacoes", label: "Exportações", icon: Download },
  { href: "/cortes", label: "Cortes longos", icon: Scissors },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-700/50 bg-gradient-to-br from-gold-500/25 to-transparent">
        <Clapperboard className="h-4 w-4 text-gold-400" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-[0.18em] text-neutral-100">VISION</span>
          <span className="block text-[10px] tracking-[0.3em] text-gold-500">AI STUDIO</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ user, org, children }: { user: { name: string; email: string }; org: { name: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isStudio = pathname.startsWith("/projetos/") && pathname.split("/").length === 3;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/entrar");
    router.refresh();
  };
  return (
    <div className="flex min-h-screen">
      <aside className={cx("sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-950 px-4 py-5 lg:flex", isStudio && "lg:hidden xl:flex xl:w-56")}>
        <Logo />
        <Link href="/novo" className="mt-6 flex h-10 items-center justify-center gap-2 rounded-lg bg-gold-500 text-sm font-semibold text-ink-950 transition hover:bg-gold-400">
          <Plus className="h-4 w-4" /> Novo projeto com IA
        </Link>
        <nav className="mt-6 space-y-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", active(n.href) ? "bg-ink-800 text-white" : "text-neutral-400 hover:bg-ink-900 hover:text-neutral-100")}>
              <n.icon className={cx("h-4 w-4", active(n.href) && "text-gold-500")} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-ink-800 pt-4">
          <p className="truncate text-sm text-neutral-200">{user.name}</p>
          <p className="truncate text-xs text-neutral-500">{org.name}</p>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-neutral-400 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-800 bg-ink-950/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <Link href="/novo" className="flex h-9 items-center gap-1.5 rounded-lg bg-gold-500 px-3 text-xs font-semibold text-ink-950">
            <Plus className="h-4 w-4" /> Novo
          </Link>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-800 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.slice(0, 5).map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-1 py-2 text-[10px]", active(n.href) ? "text-gold-400" : "text-neutral-500")}>
            <n.icon className="h-5 w-5" />
            {n.label.replace("Minhas ", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}
