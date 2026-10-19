import { and, desc, eq, getDb, projects, timelineVersions } from "@vision/db";
import { HttpError, api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Refazer: avança para a versão filha mais recente da versão atual. */
export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!p.currentVersionId) throw new HttpError(409, "Nada para refazer.");
  const db = getDb();
  const [child] = await db
    .select()
    .from(timelineVersions)
    .where(and(eq(timelineVersions.projectId, p.id), eq(timelineVersions.parentId, p.currentVersionId)))
    .orderBy(desc(timelineVersions.number))
    .limit(1);
  if (!child) throw new HttpError(409, "Nada para refazer.");
  await db.update(projects).set({ currentVersionId: child.id, updatedAt: new Date() }).where(eq(projects.id, p.id));
  return json({ currentVersionId: child.id });
});
