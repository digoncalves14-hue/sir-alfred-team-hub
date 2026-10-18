import { getDb } from "@vision/db";
import { getCurrentVersion, loadSources } from "@vision/server";
import { api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Transcrição com tempos por palavra dos vídeos usados na versão atual (edição pela transcrição). */
export const GET = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const cur = await getCurrentVersion(getDb(), p);
  if (!cur) return json({ assets: [] });
  const ids = [...new Set(cur.timeline.clips.map((c) => c.assetId))];
  const sources = await loadSources(getDb(), ids);
  return json({
    assets: ids.map((id) => {
      const t = sources.get(id)?.transcript;
      return { assetId: id, words: t?.words ?? [], segments: t?.segments ?? [] };
    }),
  });
});
