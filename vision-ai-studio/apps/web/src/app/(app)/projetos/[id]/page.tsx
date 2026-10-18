import { notFound } from "next/navigation";
import { asc, eq, getDb, inArray, assets, brands } from "@vision/db";
import { Studio } from "@/components/studio/Studio";
import { HttpError } from "@/lib/api";
import { brandDto } from "@/lib/dto";
import { projectDetail } from "@/lib/projects";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Estúdio" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  let detail;
  try {
    detail = await projectDetail(id, s.org.id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const db = getDb();
  const rows = await db.select().from(brands).where(eq(brands.orgId, s.org.id)).orderBy(asc(brands.createdAt));
  const logoIds = rows.map((b) => b.logoAssetId).filter(Boolean) as string[];
  const logos = logoIds.length ? await db.select().from(assets).where(inArray(assets.id, logoIds)) : [];
  return <Studio initial={detail} brands={await Promise.all(rows.map((b) => brandDto(b, logos)))} />;
}
