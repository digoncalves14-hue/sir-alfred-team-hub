import { captionCues, toSrt } from "@vision/core";
import { getDb } from "@vision/db";
import { getCurrentVersion } from "@vision/server";
import { HttpError, api } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

/** Exporta as legendas da versão atual em SRT (tempos já ajustados aos cortes). */
export const GET = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const current = await getCurrentVersion(getDb(), p);
  if (!current?.timeline.captions.blocks.length) throw new HttpError(404, "Este projeto ainda não tem legendas.");
  const srt = toSrt(captionCues({ ...current.timeline, captions: { ...current.timeline.captions, enabled: true } }));
  const name = `${p.name.normalize("NFD").replace(/[^\w-]+/g, "-").slice(0, 60) || "legendas"}.srt`;
  return new Response(srt, {
    headers: { "Content-Type": "application/x-subrip; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
});
