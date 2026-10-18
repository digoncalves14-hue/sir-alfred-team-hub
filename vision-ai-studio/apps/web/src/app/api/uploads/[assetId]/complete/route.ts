import { z } from "zod";
import { and, eq, getDb, assets, enqueueJob } from "@vision/db";
import { getStorage } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";

const Body = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1).max(200) })).max(10000).optional(),
});

/** Confirma o upload e coloca o arquivo na fila de processamento. */
export const POST = api(async (req, { session, params }) => {
  const db = getDb();
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, params.assetId), eq(assets.orgId, session.org.id)));
  if (!asset) throw new HttpError(404, "Arquivo não encontrado.");
  if (asset.status !== "pending_upload") return json({ ok: true, status: asset.status });
  const body = await readJson(req, Body);
  const storage = getStorage();
  const uploadId = (asset.uploadSession as { uploadId?: string } | null)?.uploadId;
  try {
    await storage.completeUpload(asset.storageKey, { uploadId, parts: body.parts });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const stat = await storage.stat(asset.storageKey);
  if (!stat || stat.size === 0) throw new HttpError(400, "O arquivo enviado está vazio.");
  if (stat.size > asset.sizeBytes) {
    await storage.delete(asset.storageKey);
    throw new HttpError(400, "O arquivo enviado é maior que o declarado.");
  }
  await db.update(assets).set({ status: "uploaded", sizeBytes: stat.size, uploadSession: null, updatedAt: new Date() }).where(eq(assets.id, asset.id));
  const job = await enqueueJob(db, { orgId: asset.orgId, projectId: asset.projectId, assetId: asset.id, type: "probe", priority: 20 });
  return json({ ok: true, jobId: job.id });
});
