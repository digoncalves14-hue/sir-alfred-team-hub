import { z } from "zod";
import { suggestClips } from "@vision/core";
import { and, eq, getDb, assets } from "@vision/db";
import { loadSources } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({ durationSec: z.number().min(5).max(600), count: z.number().int().min(1).max(20).default(6) });

/** Sugestões de cortes curtos a partir das gravações completas do projeto. */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const b = await readJson(req, Body);
  const db = getDb();
  const rows = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, p.id), eq(assets.role, "source"), eq(assets.status, "ready")));
  if (!rows.length) throw new HttpError(409, "Nenhum vídeo analisado neste projeto ainda.");
  const sources = await loadSources(db, rows.map((r) => r.id));
  const suggestions = suggestClips(sources, { durationSec: b.durationSec, count: b.count, styleId: p.styleId });
  const hasTranscript = [...sources.values()].some((s) => s.transcript);
  return json({ suggestions, basis: hasTranscript ? "transcrição + análise técnica" : "apenas análise técnica (sem transcrição)" });
});
