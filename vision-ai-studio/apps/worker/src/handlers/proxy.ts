import path from "node:path";
import { eq, assets } from "@vision/db";
import { getStorage, makeStorageKey } from "@vision/server";
import { createPreviewProxy } from "@vision/server/node";
import type { JobContext } from "../context";

/**
 * Gera a cópia leve da prévia. Nunca falha a tarefa: sem a cópia, a prévia
 * usa o original (mais pesado) e nada no projeto é marcado como erro.
 */
export async function handleProxy(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const [asset] = await db.select().from(assets).where(eq(assets.id, job.assetId!));
  if (!asset || asset.role !== "source" || asset.proxyKey || !asset.durationSec) return { skipped: true };
  const storage = getStorage();
  ctx.progress(0.05, "Baixando o original");
  const file = await storage.materialize(asset.storageKey, ctx.tmpDir);
  try {
    const out = path.join(ctx.tmpDir, "preview.mp4");
    ctx.progress(0.1, "Gerando cópia leve para a prévia");
    await createPreviewProxy(file.path, out, asset.durationSec, ctx.signal, (f) => ctx.progress(0.1 + f * 0.8, "Gerando cópia leve para a prévia"));
    const key = makeStorageKey(asset.orgId, "previews", "mp4");
    await storage.uploadFile(out, key, "video/mp4");
    await db.update(assets).set({ proxyKey: key, updatedAt: new Date() }).where(eq(assets.id, asset.id));
    return { proxyKey: key };
  } catch (err) {
    if (ctx.signal.aborted) throw err;
    ctx.log.warn("proxy_failed", { assetId: asset.id, err });
    return { skipped: true, reason: "failed" };
  } finally {
    await file.cleanup();
  }
}
