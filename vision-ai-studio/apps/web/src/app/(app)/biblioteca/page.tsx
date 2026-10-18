import Link from "next/link";
import { Film, Image as ImageIcon, Images, Music2 } from "lucide-react";
import { and, desc, eq, getDb, inArray, assets, projects } from "@vision/db";
import { EmptyState } from "@/components/ui";
import { assetDto } from "@/lib/dto";
import { fmtBytes, fmtDate, fmtDuration } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Biblioteca" };

const ROLES = [
  { id: "", label: "Tudo" },
  { id: "source", label: "Vídeos" },
  { id: "render", label: "Vídeos exportados" },
  { id: "music", label: "Músicas" },
  { id: "logo", label: "Logos" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await requireSession();
  const { tipo = "" } = await searchParams;
  const db = getDb();
  const rows = await db
    .select({ a: assets, projectName: projects.name })
    .from(assets)
    .leftJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(assets.orgId, s.org.id), tipo ? eq(assets.role, tipo) : inArray(assets.role, ["source", "render", "music", "logo"])))
    .orderBy(desc(assets.createdAt))
    .limit(200);
  const list = await Promise.all(rows.map(async (r) => ({ ...(await assetDto(r.a)), projectName: r.projectName })));
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold">Biblioteca de mídia</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {ROLES.map((r) => (
          <Link key={r.id} href={r.id ? `/biblioteca?tipo=${r.id}` : "/biblioteca"} className={`rounded-full border px-3 py-1 text-xs ${tipo === r.id ? "border-gold-600 bg-gold-700/20 text-gold-300" : "border-ink-700 text-neutral-400 hover:text-white"}`}>{r.label}</Link>
        ))}
      </div>
      {list.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {list.map((a) => (
            <div key={a.id} className="panel overflow-hidden">
              <div className="grid aspect-video place-items-center bg-ink-850">
                {a.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : a.role === "logo" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="h-full w-full object-contain p-3" />
                ) : a.kind === "audio" ? (
                  <Music2 className="h-6 w-6 text-gold-500" />
                ) : a.kind === "image" ? (
                  <ImageIcon className="h-6 w-6 text-neutral-600" />
                ) : (
                  <Film className="h-6 w-6 text-neutral-600" />
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium">{a.name}</p>
                <p className="truncate text-[10px] text-neutral-500">
                  {a.durationSec ? `${fmtDuration(a.durationSec)} · ` : ""}{fmtBytes(a.sizeBytes)} · {fmtDate(a.createdAt)}
                </p>
                {a.projectId && a.projectName && <Link href={`/projetos/${a.projectId}`} className="block truncate text-[10px] text-gold-400 hover:underline">{a.projectName}</Link>}
                {a.status === "error" && <p className="text-[10px] text-red-300">{a.errorMessage}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6"><EmptyState icon={<Images className="h-8 w-8" />} title="Nenhum arquivo">Os vídeos enviados, exportações, músicas e logos aparecem aqui.</EmptyState></div>
      )}
    </div>
  );
}
