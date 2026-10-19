import { getDb, requestCancel } from "@vision/db";
import { refreshProjectStatus } from "@vision/server";
import { api, json, notFound } from "@/lib/api";

export const POST = api(async (_req, { session, params }) => {
  const db = getDb();
  const job = await requestCancel(db, params.id, session.org.id);
  if (!job) throw notFound("Tarefa");
  if (job.projectId) await refreshProjectStatus(db, job.projectId);
  return json({ ok: true });
});
