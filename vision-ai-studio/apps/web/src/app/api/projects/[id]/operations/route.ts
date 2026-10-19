import { z } from "zod";
import { EditOperation, applyEditPlan } from "@vision/core";
import { getDb } from "@vision/db";
import { createVersion, getCurrentVersion } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { engineContext } from "@/lib/engine-context";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  operations: z.array(EditOperation).min(1).max(12),
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
  let result;
  try {
    result = applyEditPlan(current.timeline, { reply: "", operations: body.operations }, await engineContext(p, current.timeline));
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
