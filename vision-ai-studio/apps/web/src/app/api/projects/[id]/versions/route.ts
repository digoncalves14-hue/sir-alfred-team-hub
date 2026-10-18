import { z } from "zod";
import { TimelineSchema, applyAutoFocus, parseTimeline } from "@vision/core";
import { and, eq, getDb, inArray, assets } from "@vision/db";
import { createVersion, getCurrentVersion, loadSources } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  timeline: TimelineSchema,
  summary: z.string().trim().min(1).max(300),
  baseVersionId: z.string().uuid().nullable().optional(),
});

/** Edição manual (modo avançado): a timeline enviada é validada e vira uma nova versão. */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const body = await readJson(req, Body);
  const db = getDb();
  const current = await getCurrentVersion(db, p);
  if (body.baseVersionId && current && body.baseVersionId !== current.version.id) {
    throw new HttpError(409, "O projeto foi alterado em outra aba ou pela IA. Recarregue para continuar.");
  }
  let timeline = parseTimeline(body.timeline);
  // todos os arquivos precisam pertencer à organização e estar prontos
  const ids = [...new Set([...timeline.clips.map((c) => c.assetId), ...timeline.logos.map((l) => l.assetId), ...(timeline.audio.music ? [timeline.audio.music.assetId] : [])])];
  const rows = ids.length ? await db.select().from(assets).where(and(eq(assets.orgId, session.org.id), inArray(assets.id, ids))) : [];
  if (rows.length !== ids.length) throw new HttpError(400, "A timeline referencia arquivos inexistentes.");
  for (const c of timeline.clips) {
    const a = rows.find((r) => r.id === c.assetId)!;
    if (a.role !== "source") throw new HttpError(400, "Clipes de vídeo devem usar vídeos de origem.");
    if (a.durationSec && c.sourceEnd > a.durationSec + 0.05) throw new HttpError(400, "Um corte ultrapassa a duração do vídeo.");
  }
  if (!timeline.clips.length) throw new HttpError(400, "A timeline precisa ter pelo menos um trecho.");
  timeline = parseTimeline({ ...timeline, clips: applyAutoFocus(timeline.clips, await loadSources(db, ids)) });
  const v = await createVersion(db, {
    orgId: p.orgId,
    projectId: p.id,
    timeline,
    source: "manual",
    summary: body.summary,
    parentId: current?.version.id ?? null,
    userId: session.user.id,
  });
  return json({ versionId: v.id, number: v.number }, { status: 201 });
});
