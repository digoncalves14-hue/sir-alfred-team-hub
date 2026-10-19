import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, eq, getDb, assets, brands } from "@vision/db";
import { BrandEditor } from "@/components/BrandEditor";
import { assetDto, brandDto } from "@/lib/dto";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Marca" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const [b] = await db.select().from(brands).where(and(eq(brands.id, id), eq(brands.orgId, s.org.id)));
  if (!b) notFound();
  const files = await db.select().from(assets).where(eq(assets.brandId, b.id));
  const logo = b.logoAssetId ? (await db.select().from(assets).where(eq(assets.id, b.logoAssetId))) : [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <Link href="/marcas" className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Minhas Marcas</Link>
      <h1 className="mb-6 text-xl font-semibold">{b.name}</h1>
      <BrandEditor brand={await brandDto(b, [...files, ...logo])} files={await Promise.all(files.map(assetDto))} />
    </div>
  );
}
