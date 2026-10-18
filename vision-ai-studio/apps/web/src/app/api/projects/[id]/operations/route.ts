import { z } from "zod";
import { EditOperation, applyEditPlan } from "@vision/core";
import { and, eq, getDb, assets, or } from "@vision/db";
import { createVersion, getCurrentVersion, loadBrandContext, loadSources } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  operations: z.array(EditOperation).min(1).max(10),
  summary: z.string().trim().max(300).optional(),
  baseVersionId: z.string().uuid().nullable().optional(),
});

/**
 * Aplica operações estruturadas diretamente pelo motor determinístico (sem IA).
 * Usado pelos controles manuais — garante consistência entre o modo automático e o avançado.
 */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const body = await readJson(req, Body);
  const db = getDb();
  const current = await getCurrentVersion(db, p);
  if (!current) throw new HttpError(409, "O projeto ainda não tem vídeos processados.");
  if (body.baseVersionId && body.baseVersionId !== current.version.id) {
    throw new HttpError(409, "O projeto foi alterado em outra aba ou pela IA. Recarregue para continuar.");
  }
  const sources = await loadSources(db, [...new Set(current.timeline.clips.map((c) => c.assetId))]);
  const brand = await loadBrandContext(db, p.orgId, p.brandId);
  const music = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, p.orgId), eq(assets.role, "music"), eq(assets.status, "ready"), or(eq(assets.projectId, p.id), p.brandId ? eq(assets.brandId, p.brandId) : eq(assets.projectId, p.id))));
  let result;
  try {
    result = applyEditPlan(current.timeline, { reply: "", operations: body.operations }, { sources, brand, musicAssetIds: music.map((m) => m.id) });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const changed = JSON.stringify(result.timeline) !== JSON.stringify(current.timeline);
  let versionId: string | null = null;
  if (changed) {
    const v = await createVersion(db, {
      orgId: p.orgId,
      projectId: p.id,
      timeline: result.timeline,
      source: "manual",
      summary: body.summary ?? (result.applied.join(" ") || "Edição manual"),
      parentId: current.version.id,
      userId: session.user.id,
    });
    versionId = v.id;
  }
  return json({ changed, versionId, applied: result.applied, warnings: result.warnings, unsupported: result.unsupported });
});
