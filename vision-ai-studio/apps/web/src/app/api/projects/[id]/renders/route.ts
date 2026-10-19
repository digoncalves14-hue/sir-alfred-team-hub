import { z } from "zod";
import { FORMAT_PRESET_IDS, RESOLUTIONS, RenderSettingsSchema } from "@vision/core";
import { eq, getDb, enqueueJob, exportsTable, renders } from "@vision/db";
import { assertWithinLimits } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  kind: z.enum(["export", "preview"]).default("export"),
  presets: z.array(z.enum(FORMAT_PRESET_IDS)).min(1).max(9),
  resolution: z.enum(RESOLUTIONS).default("1080p"),
  quality: z.enum(["high", "balanced", "light"]).default("balanced"),
  videoBitrateKbps: z.number().int().min(300).max(80000).nullable().default(null),
  fps: z.number().int().min(12).max(60).nullable().default(null),
});

/** Exporta a versão atual em um ou vários formatos (exportação em lote). */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!p.currentVersionId) throw new HttpError(409, "O projeto ainda não tem uma versão para exportar.");
  const body = await readJson(req, Body);
  const db = getDb();
  await assertWithinLimits(db, p.orgId, "render");
  const settings = RenderSettingsSchema.parse({ resolution: body.resolution, quality: body.quality, videoBitrateKbps: body.videoBitrateKbps, fps: body.fps });
  const presets = body.kind === "preview" ? body.presets.slice(0, 1) : [...new Set(body.presets)];
  let exportId: string | null = null;
  if (body.kind === "export") {
    const [e] = await db.insert(exportsTable).values({ orgId: p.orgId, projectId: p.id, versionId: p.currentVersionId, presets, settings, createdBy: session.user.id }).returning();
    exportId = e.id;
  }
  const ids: string[] = [];
  for (const preset of presets) {
    const [r] = await db
      .insert(renders)
      .values({ orgId: p.orgId, projectId: p.id, versionId: p.currentVersionId, exportId, kind: body.kind, preset, settings, createdBy: session.user.id })
      .returning();
    const job = await enqueueJob(db, { orgId: p.orgId, projectId: p.id, type: "render", payload: { renderId: r.id }, priority: body.kind === "preview" ? 40 : 60, maxAttempts: 2 });
    await db.update(renders).set({ jobId: job.id }).where(eq(renders.id, r.id));
    ids.push(r.id);
  }
  return json({ renderIds: ids, exportId }, { status: 202 });
});
