import Link from "next/link";
import { Gem } from "lucide-react";
import { asc, eq, getDb, inArray, assets, brands } from "@vision/db";
import { EDIT_STYLES, type EditStyleId } from "@vision/core";
import { Badge } from "@/components/ui";
import { brandDto } from "@/lib/dto";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Minhas Marcas" };

export default async function Page() {
  const s = await requireSession();
  const db = getDb();
  const rows = await db.select().from(brands).where(eq(brands.orgId, s.org.id)).orderBy(asc(brands.createdAt));
  const logoIds = rows.map((b) => b.logoAssetId).filter(Boolean) as string[];
  const logos = logoIds.length ? await db.select().from(assets).where(inArray(assets.id, logoIds)) : [];
  const list = await Promise.all(rows.map((b) => brandDto(b, logos)));
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold">Minhas Marcas</h1>
      <p className="mt-1 text-sm text-neutral-400">Cada marca tem logo oficial, cores, fontes, músicas licenciadas e estilo padrão. A logo nunca é recriada pela IA: use sempre o arquivo oficial.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((b) => (
          <Link key={b.id} href={`/marcas/${b.id}`} className="panel block p-5 transition hover:border-ink-600">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg border border-ink-700" style={{ background: b.colors[0] ?? "#111" }}>
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt={`Logo ${b.name}`} className="h-full w-full object-contain p-1" />
                ) : (
                  <Gem className="h-5 w-5 text-gold-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{b.name}</p>
                <p className="truncate text-xs text-neutral-500">{b.segment}</p>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-xs text-neutral-400">{b.tone}</p>
            <div className="mt-3 flex items-center gap-1.5">
              {b.colors.map((c) => <span key={c} className="h-4 w-4 rounded-full border border-ink-950" style={{ background: c }} title={c} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {!b.logoUrl && <Badge tone="warn">Logo oficial pendente</Badge>}
              {b.defaultStyleId && <Badge>{EDIT_STYLES[b.defaultStyleId as EditStyleId]?.label ?? b.defaultStyleId}</Badge>}
              <Badge>{b.musicAssetIds.length} músicas</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
