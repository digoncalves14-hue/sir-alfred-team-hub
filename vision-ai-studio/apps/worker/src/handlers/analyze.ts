import { eq, assets, segments } from "@vision/db";
import { ProcessingError, getStorage, recordUsage } from "@vision/server";
import { analyzeFile } from "@vision/server/node";
import type { MediaProbe } from "@vision/core";
import type { JobContext } from "../context";

/** Análise técnica: silêncio, cenas e movimento. Resultado salvo no arquivo e na tabela de segmentos. */
export async function handleAnalyze(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const [asset] = await db.select().from(assets).where(eq(assets.id, job.assetId!));
  if (!asset?.probe) throw new ProcessingError("not_ready", "O arquivo ainda não foi lido.");
  const started = Date.now();
  const file = await getStorage().materialize(asset.storageKey, ctx.tmpDir);
  try {
    const analysis = await analyzeFile(file.path, asset.probe as unknown as MediaProbe, {
      signal: ctx.signal,
      onStage: (stage, p) => ctx.progress(p, stage),
    });
    await db.transaction(async (tx) => {
      await tx.update(assets).set({ analysis: analysis as unknown as Record<string, unknown>, status: "ready", updatedAt: new Date() }).where(eq(assets.id, asset.id));
      await tx.delete(segments).where(eq(segments.assetId, asset.id));
      const rows = [
        ...analysis.silences.map((s) => ({ kind: "silence", start: s.start, end: s.end })),
        ...analysis.sceneCuts.map((t) => ({ kind: "scene", start: t, end: t })),
        ...analysis.staticIntervals.map((s) => ({ kind: "static", start: s.start, end: s.end })),
      ];
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(segments).values(rows.slice(i, i + 500).map((r) => ({ ...r, orgId: asset.orgId, assetId: asset.id })));
      }
    });
    await recordUsage(db, { orgId: asset.orgId, projectId: asset.projectId, kind: "analysis_seconds", quantity: (Date.now() - started) / 1000, meta: { assetId: asset.id } });
    return { silences: analysis.silences.length, sceneCuts: analysis.sceneCuts.length };
  } finally {
    await file.cleanup();
  }
}
