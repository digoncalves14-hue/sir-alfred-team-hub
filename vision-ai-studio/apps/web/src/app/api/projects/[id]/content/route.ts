import { getDb, contentSuggestions, enqueueJob } from "@vision/db";
import { assertWithinLimits, capabilities } from "@vision/server";
import { HttpError, api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Pede à IA títulos, descrições, legendas, hashtags e ideias de capa para o vídeo editado. */
export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!capabilities().ai) throw new HttpError(501, "A geração de textos requer um provedor de IA configurado (ANTHROPIC_API_KEY).");
  if (!p.currentVersionId) throw new HttpError(409, "Aguarde o processamento dos vídeos.");
  const db = getDb();
  await assertWithinLimits(db, p.orgId, "ai");
  const [row] = await db.insert(contentSuggestions).values({ orgId: p.orgId, projectId: p.id, versionId: p.currentVersionId, createdBy: session.user.id }).returning();
  await enqueueJob(db, { orgId: p.orgId, projectId: p.id, type: "generate_content", payload: { contentId: row.id }, priority: 50, maxAttempts: 2 });
  return json({ id: row.id }, { status: 202 });
});
