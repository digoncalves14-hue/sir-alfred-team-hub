import { parseTimeline } from "@vision/core";
import { and, eq, getDb, timelineVersions } from "@vision/db";
import { createVersion } from "@vision/server";
import { api, json, notFound } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Restaura uma versão antiga criando uma NOVA versão (o histórico nunca é apagado). */
export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const db = getDb();
  const [v] = await db.select().from(timelineVersions).where(and(eq(timelineVersions.id, params.vid), eq(timelineVersions.projectId, p.id)));
  if (!v) throw notFound("Versão");
  const nv = await createVersion(db, {
    orgId: p.orgId,
    projectId: p.id,
    timeline: parseTimeline(v.timeline),
    source: "restore",
    summary: `Restaurada a versão ${v.number}`,
    parentId: p.currentVersionId,
    userId: session.user.id,
  });
  return json({ versionId: nv.id });
});
