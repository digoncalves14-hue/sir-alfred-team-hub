import { and, eq, getDb, inArray, assets, enqueueJob, jobs } from "@vision/db";
import { capabilities } from "@vision/server";
import { HttpError, api, json } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

export const POST = api(async (_req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!capabilities().transcription) {
    throw new HttpError(501, "A transcrição automática não está configurada neste servidor (defina OPENAI_API_KEY ou whisper.cpp).");
  }
  const db = getDb();
  const sources = await db.select().from(assets).where(and(eq(assets.projectId, p.id), eq(assets.role, "source"), eq(assets.status, "ready")));
  const pending = await db.select({ assetId: jobs.assetId }).from(jobs).where(and(eq(jobs.projectId, p.id), eq(jobs.type, "transcribe"), inArray(jobs.status, ["queued", "running"])));
  const queued: string[] = [];
  for (const s of sources.filter((x) => x.hasAudio && !pending.some((j) => j.assetId === x.id))) {
    const j = await enqueueJob(db, { orgId: p.orgId, projectId: p.id, assetId: s.id, type: "transcribe" });
    queued.push(j.id);
  }
  return json({ jobIds: queued }, { status: 202 });
});
