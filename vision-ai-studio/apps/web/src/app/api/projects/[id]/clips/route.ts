import { z } from "zod";
import { initialTimeline, parseTimeline } from "@vision/core";
import { and, eq, getDb, assets, projects } from "@vision/db";
import { createVersion } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  assetId: z.string().uuid(),
  start: z.number().min(0),
  end: z.number().positive(),
  title: z.string().trim().min(1).max(120),
});

/** Aprova uma sugestão: cria um novo projeto com o corte (reaproveita o vídeo, sem copiar mídia). */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const b = await readJson(req, Body);
  const db = getDb();
  const [a] = await db.select().from(assets).where(and(eq(assets.id, b.assetId), eq(assets.orgId, session.org.id), eq(assets.role, "source")));
  if (!a?.durationSec) throw new HttpError(404, "Vídeo de origem não encontrado.");
  if (b.end <= b.start || b.end > a.durationSec + 0.05) throw new HttpError(400, "Intervalo do corte inválido.");
  const [child] = await db
    .insert(projects)
    .values({
      orgId: p.orgId,
      brandId: p.brandId,
      name: b.title,
      kind: "long_to_short",
      status: "editing",
      destinations: p.destinations,
      primaryPreset: p.primaryPreset,
      styleId: p.styleId,
      folder: p.folder ?? p.name.slice(0, 80),
      thumbnailKey: a.thumbnailKey,
      parentProjectId: p.id,
      createdBy: session.user.id,
    })
    .returning();
  const base = initialTimeline([{ id: a.id, durationSec: a.durationSec, fps: a.fps }], p.primaryPreset as never, { brandId: p.brandId, styleId: p.styleId });
  const tl = parseTimeline({ ...base, clips: [{ ...base.clips[0], sourceStart: b.start, sourceEnd: Math.min(b.end, a.durationSec) }] });
  await createVersion(db, { orgId: p.orgId, projectId: child.id, timeline: tl, source: "initial", summary: `Corte aprovado de “${p.name}” (${b.start.toFixed(1)}s–${b.end.toFixed(1)}s)`, userId: session.user.id });
  return json({ id: child.id }, { status: 201 });
});
