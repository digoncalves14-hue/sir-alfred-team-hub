import { eq, getDb, projects, timelineVersions } from "@vision/db";
import { HttpError, api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Desfazer: volta para a versão anterior (pai) da versão atual. */
export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!p.currentVersionId) throw new HttpError(409, "Nada para desfazer.");
  const db = getDb();
  const [cur] = await db.select().from(timelineVersions).where(eq(timelineVersions.id, p.currentVersionId));
  if (!cur?.parentId) throw new HttpError(409, "Esta já é a primeira versão.");
  await db.update(projects).set({ currentVersionId: cur.parentId, updatedAt: new Date() }).where(eq(projects.id, p.id));
  return json({ currentVersionId: cur.parentId });
});
