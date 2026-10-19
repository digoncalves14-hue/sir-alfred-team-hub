import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { and, desc, eq, getDb, isNull, brands, projects } from "@vision/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/ui";
import { projectCardDto } from "@/lib/dto";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Projetos" };

const FILTERS = [
  { id: "", label: "Todos" },
  { id: "processing", label: "Em processamento" },
  { id: "ready", label: "Concluídos" },
  { id: "editing", label: "Prontos para editar" },
  { id: "error", label: "Com erro" },
];
const BUSY = ["queued", "analyzing", "transcribing", "selecting", "rendering"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ f?: string; pasta?: string }> }) {
  const s = await requireSession();
  const { f = "", pasta } = await searchParams;
  const rows = await getDb()
    .select({ p: projects, brandName: brands.name })
    .from(projects)
    .leftJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(projects.orgId, s.org.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt))
    .limit(300);
  const all = await Promise.all(rows.map((r) => projectCardDto(r.p, r.brandName)));
  const folders = [...new Set(all.map((p) => p.folder).filter(Boolean))] as string[];
  const list = all
    .filter((p) => (f === "processing" ? BUSY.includes(p.status) : f ? p.status === f : true))
    .filter((p) => (pasta ? p.folder === pasta : true));
  const q = (o: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(Object.entries({ f, pasta, ...o }).filter(([, v]) => v) as Array<[string, string]>);
    return `/projetos${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <AutoRefresh active={all.some((p) => BUSY.includes(p.status))} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Projetos</h1>
        <Link href="/novo" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400"><Plus className="h-4 w-4" /> Novo projeto</Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.id} href={q({ f: x.id || undefined })} className={`rounded-full border px-3 py-1 text-xs ${f === x.id ? "border-gold-600 bg-gold-700/20 text-gold-300" : "border-ink-700 text-neutral-400 hover:text-white"}`}>{x.label}</Link>
        ))}
        {folders.map((fo) => (
          <Link key={fo} href={q({ pasta: pasta === fo ? undefined : fo })} className={`rounded-full border px-3 py-1 text-xs ${pasta === fo ? "border-gold-600 bg-gold-700/20 text-gold-300" : "border-ink-700 text-neutral-400 hover:text-white"}`}>📁 {fo}</Link>
        ))}
      </div>
      {list.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      ) : (
        <EmptyState icon={<FolderKanban className="h-8 w-8" />} title="Nenhum projeto encontrado">Crie um novo projeto ou altere os filtros.</EmptyState>
      )}
    </div>
  );
}
