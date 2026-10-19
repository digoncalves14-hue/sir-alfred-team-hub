import { asc, eq, getDb, inArray, assets, brands } from "@vision/db";
import { api, json } from "@/lib/api";
import { brandDto } from "@/lib/dto";

export const GET = api(async (_req, { session }) => {
  const db = getDb();
  const rows = await db.select().from(brands).where(eq(brands.orgId, session.org.id)).orderBy(asc(brands.createdAt));
  const logoIds = rows.map((b) => b.logoAssetId).filter(Boolean) as string[];
  const logos = logoIds.length ? await db.select().from(assets).where(inArray(assets.id, logoIds)) : [];
  return json({ brands: await Promise.all(rows.map((b) => brandDto(b, logos))) });
});
