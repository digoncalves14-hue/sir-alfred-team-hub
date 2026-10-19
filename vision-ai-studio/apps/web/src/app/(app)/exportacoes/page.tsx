import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { FORMAT_PRESETS, type FormatPresetId } from "@vision/core";
import { and, desc, eq, getDb, projects, renders } from "@vision/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EmptyState, Progress, StatusBadge } from "@/components/ui";
import { fmtBytes, fmtDate, fmtDuration } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Exportações" };
const LABEL: Record<string, string> = { queued: "Na fila", running: "Renderizando", succeeded: "Concluído", failed: "Falhou", canceled: "Cancelado" };

export default async function Page() {
  const s = await requireSession();
  const rows = await getDb()
    .select({ r: renders, name: projects.name })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(and(eq(renders.orgId, s.org.id), eq(renders.kind, "export")))
    .orderBy(desc(renders.createdAt))
    .limit(200);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <AutoRefresh active={rows.some(({ r }) => r.status === "queued" || r.status === "running")} />
      <h1 className="text-xl font-semibold">Histórico de exportações</h1>
      <p className="mt-1 text-sm text-neutral-400">Arquivos MP4 prontos para publicação manual nas redes sociais.</p>
      {rows.length ? (
        <ul className="mt-6 space-y-2">
          {rows.map(({ r, name }) => (
            <li key={r.id} className="panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/projetos/${r.projectId}`} className="block truncate text-sm font-medium hover:text-gold-300">{name}</Link>
                <p className="text-xs text-neutral-500">
                  {FORMAT_PRESETS[r.preset as FormatPresetId]?.label ?? r.preset} · {String((r.settings as { resolution?: string }).resolution ?? "")}
                  {r.width ? ` · ${r.width}×${r.height}` : ""}{r.durationSec ? ` · ${fmtDuration(r.durationSec)}` : ""}{r.sizeBytes ? ` · ${fmtBytes(r.sizeBytes)}` : ""} · {fmtDate(r.createdAt.toISOString())}
                </p>
                {(r.status === "running" || r.status === "queued") && <Progress value={r.progress} className="mt-2 max-w-xs" />}
                {r.status === "failed" && <p className="mt-1 text-xs text-red-300">{r.errorMessage}</p>}
              </div>
              <StatusBadge status={r.status} label={LABEL[r.status] ?? r.status} />
              {r.status === "succeeded" && (
                <div className="flex gap-2">
                  <a href={`/api/renders/${r.id}/download`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold-500 px-3 text-xs font-semibold text-ink-950 hover:bg-gold-400"><Download className="h-3.5 w-3.5" /> MP4</a>
                  {r.srtAssetId && <a href={`/api/renders/${r.id}/download?file=srt`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-600 px-3 text-xs hover:bg-ink-700"><FileText className="h-3.5 w-3.5" /> SRT</a>}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6"><EmptyState icon={<Download className="h-8 w-8" />} title="Nenhuma exportação ainda">Abra um projeto e use a aba Exportar.</EmptyState></div>
      )}
    </div>
  );
}
