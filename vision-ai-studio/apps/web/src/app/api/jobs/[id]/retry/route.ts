import { and, eq, getDb, aiCommands, assets, enqueueJob, jobs, renders } from "@vision/db";
import { refreshProjectStatus } from "@vision/server";
import { HttpError, api, json, notFound } from "@/lib/api";

/** Tenta novamente uma tarefa que falhou ou foi cancelada (o projeto nunca é perdido). */
export const POST = api(async (_req, { session, params }) => {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, params.id), eq(jobs.orgId, session.org.id)));
  if (!job) throw notFound("Tarefa");
  if (job.status !== "failed" && job.status !== "canceled") throw new HttpError(409, "Só é possível repetir tarefas com falha ou canceladas.");
  if (job.assetId && (job.type === "probe" || job.type === "analyze")) {
    await db.update(assets).set({ status: "uploaded", errorMessage: null }).where(eq(assets.id, job.assetId));
  }
  if (job.type === "render" && job.payload.renderId) {
    await db.update(renders).set({ status: "queued", progress: 0, errorMessage: null }).where(eq(renders.id, String(job.payload.renderId)));
  }
  if (job.type === "ai_command" && job.payload.commandId) {
    await db.update(aiCommands).set({ status: "queued", errorMessage: null }).where(eq(aiCommands.id, String(job.payload.commandId)));
  }
  const next = await enqueueJob(db, {
    orgId: job.orgId,
    projectId: job.projectId,
    assetId: job.assetId,
    type: job.type as never,
    payload: job.payload,
    priority: job.priority,
    maxAttempts: job.maxAttempts,
  });
  if (job.type === "render" && job.payload.renderId) await db.update(renders).set({ jobId: next.id }).where(eq(renders.id, String(job.payload.renderId)));
  if (job.projectId) await refreshProjectStatus(db, job.projectId);
  return json({ jobId: next.id });
});
