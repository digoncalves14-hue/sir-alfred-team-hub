import { diffTimelines, parseTimeline, timelineDuration } from "@vision/core";
import { and, eq, getDb, inArray, timelineVersions } from "@vision/db";
import { HttpError, api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

export const GET = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  const a = req.nextUrl.searchParams.get("a");
  const b = req.nextUrl.searchParams.get("b");
  if (!a || !b) throw new HttpError(400, "Informe as versões a comparar.");
  const rows = await getDb()
    .select()
    .from(timelineVersions)
    .where(and(eq(timelineVersions.projectId, p.id), inArray(timelineVersions.id, [a, b])));
  const va = rows.find((r) => r.id === a);
  const vb = rows.find((r) => r.id === b);
  if (!va || !vb) throw new HttpError(404, "Versão não encontrada.");
  const ta = parseTimeline(va.timeline);
  const tb = parseTimeline(vb.timeline);
  return json({
    a: { number: va.number, duration: timelineDuration(ta), clips: ta.clips.length, timeline: ta },
    b: { number: vb.number, duration: timelineDuration(tb), clips: tb.clips.length, timeline: tb },
    changes: diffTimelines(ta, tb),
  });
});
