import { z } from "zod";
import { FORMAT_PRESET_IDS } from "@vision/core";
import { and, eq, getDb, inArray, brands, jobs, projects, requestCancel } from "@vision/db";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg, projectDetail } from "@/lib/projects";

export const GET = api(async (_req, { session, params }) => json(await projectDetail(params.id, session.org.id)));

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  brandId: z.string().uuid().nullable().optional(),
  folder: z.string().trim().max(80).nullable().optional(),
  primaryPreset: z.enum(FORMAT_PRESET_IDS).optional(),
});

export const PATCH = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const body = await readJson(req, Patch);
  if (body.brandId) {
    const [b] = await getDb().select().from(brands).where(and(eq(brands.id, body.brandId), eq(brands.orgId, session.org.id)));
    if (!b) throw new HttpError(400, "Marca inválida.");
  }
  await getDb().update(projects).set({ ...body, updatedAt: new Date() }).where(eq(projects.id, p.id));
  return json({ ok: true });
});

/** Exclusão lógica (mantém arquivos até a política de retenção); cancela tarefas pendentes. */
export const DELETE = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const db = getDb();
  const active = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.projectId, p.id), inArray(jobs.status, ["queued", "running"])));
  for (const j of active) await requestCancel(db, j.id, session.org.id);
  await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, p.id));
  return json({ ok: true });
});
