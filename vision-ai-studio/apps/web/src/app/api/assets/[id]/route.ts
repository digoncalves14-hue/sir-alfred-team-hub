import { parseTimeline } from "@vision/core";
import { and, eq, getDb, isNull, assets, brands, projects, timelineVersions } from "@vision/db";
import { getStorage } from "@vision/server";
import { HttpError, api, json, notFound } from "@/lib/api";

/** Exclui um arquivo apenas se nenhuma versão atual de projeto o utiliza. */
export const DELETE = api(async (_req, { session, params }) => {
  const db = getDb();
  const [a] = await db.select().from(assets).where(and(eq(assets.id, params.id), eq(assets.orgId, session.org.id)));
  if (!a) throw notFound("Arquivo");
  const current = await db
    .select({ tl: timelineVersions.timeline, name: projects.name })
    .from(projects)
    .innerJoin(timelineVersions, eq(timelineVersions.id, projects.currentVersionId))
    .where(and(eq(projects.orgId, session.org.id), isNull(projects.deletedAt)));
  for (const row of current) {
    const tl = parseTimeline(row.tl);
    const used = tl.clips.some((c) => c.assetId === a.id) || tl.logos.some((l) => l.assetId === a.id) || tl.audio.music?.assetId === a.id;
    if (used) throw new HttpError(409, `Este arquivo está em uso no projeto "${row.name}".`);
  }
  const brandRows = await db.select().from(brands).where(eq(brands.orgId, session.org.id));
  for (const b of brandRows) {
    if (b.logoAssetId === a.id) await db.update(brands).set({ logoAssetId: null }).where(eq(brands.id, b.id));
    if (b.musicAssetIds.includes(a.id)) await db.update(brands).set({ musicAssetIds: b.musicAssetIds.filter((m) => m !== a.id) }).where(eq(brands.id, b.id));
  }
  await getStorage().delete(a.storageKey).catch(() => {});
  if (a.thumbnailKey) await getStorage().delete(a.thumbnailKey).catch(() => {});
  await db.delete(assets).where(eq(assets.id, a.id));
  return json({ ok: true });
});
