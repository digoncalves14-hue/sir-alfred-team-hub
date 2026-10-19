import { z } from "zod";
import { applyEditPlan, templateToOperations } from "@vision/core";
import { eq, getDb, projects } from "@vision/db";
import { createVersion, getCurrentVersion } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { engineContext } from "@/lib/engine-context";
import { getProjectForOrg } from "@/lib/projects";
import { findTemplate } from "@/lib/templates";

const Body = z.object({ templateId: z.string().min(1).max(80) });

/** Aplica um template: operações determinísticas agora + orientação para a IA nos próximos comandos. */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const { templateId } = await readJson(req, Body);
  const t = await findTemplate(templateId, session.org.id);
  if (!t) throw new HttpError(404, "Template não encontrado.");
  const db = getDb();
  const current = await getCurrentVersion(db, p);
  if (!current) throw new HttpError(409, "Aguarde o processamento dos vídeos antes de aplicar um template.");
  const ctx = await engineContext(p, current.timeline);
  const hasTranscript = [...ctx.sources.values()].some((s) => s.transcript);
  const ops = templateToOperations(t.config, { hasMusic: ctx.musicAssetIds.length + (ctx.brand?.musicAssetIds.length ?? 0) > 0, hasTranscript, hasLogo: Boolean(ctx.brand?.logoAssetId) });
  let result;
  try {
    result = applyEditPlan(current.timeline, { reply: "", operations: ops }, ctx);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const v = await createVersion(db, {
    orgId: p.orgId,
    projectId: p.id,
    timeline: result.timeline,
    source: "manual",
    summary: `Template “${t.name}” aplicado. ${result.applied.join(" ")}`,
    parentId: current.version.id,
    userId: session.user.id,
  });
  await db.update(projects).set({ templateId: t.id, styleId: t.config.styleId }).where(eq(projects.id, p.id));
  const notes: string[] = [...result.warnings, ...result.unsupported.map((u) => u.reason)];
  if (t.config.captions.enabled && !hasTranscript) notes.push("Legendas do template não aplicadas: o projeto ainda não tem transcrição.");
  if (t.config.logo !== "none" && !ctx.brand?.logoAssetId) notes.push("Logo do template não aplicada: a marca não tem logo oficial cadastrada.");
  if (t.config.aiGuidance) notes.push("A orientação narrativa do template será usada pela IA nos próximos comandos (se a IA estiver configurada).");
  return json({ versionId: v.id, applied: result.applied, notes });
});
