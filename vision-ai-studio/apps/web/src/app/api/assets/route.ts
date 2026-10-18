import { and, desc, eq, getDb, assets } from "@vision/db";
import { api, json } from "@/lib/api";
import { assetDto } from "@/lib/dto";

/** Biblioteca de mídia da organização. */
export const GET = api(async (req, { session }) => {
  const role = req.nextUrl.searchParams.get("role");
  const rows = await getDb()
    .select()
    .from(assets)
    .where(and(eq(assets.orgId, session.org.id), role ? eq(assets.role, role) : undefined))
    .orderBy(desc(assets.createdAt))
    .limit(300);
  return json({ assets: await Promise.all(rows.map(assetDto)) });
});
