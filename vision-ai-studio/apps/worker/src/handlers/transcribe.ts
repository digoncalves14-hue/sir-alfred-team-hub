import { eq, sql, assets, segments, transcripts } from "@vision/db";
import { ProcessingError, estimateTranscriptionCost, getStorage, recordUsage, assertWithinLimits, LimitError } from "@vision/server";
import { getTranscriptionProvider } from "@vision/server/node";
import type { JobContext } from "../context";

export async function transcribeAsset(ctx: JobContext, assetId: string, progressBase = 0, progressSpan = 1): Promise<number> {
  const { db } = ctx;
  const provider = getTranscriptionProvider();
  if (!provider) {
    throw new ProcessingError(
      "transcription_not_configured",
      "A transcrição automática não está configurada neste servidor (defina OPENAI_API_KEY ou whisper.cpp).",
    );
  }
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) throw new ProcessingError("not_found", "Arquivo não encontrado.");
  if (!asset.hasAudio) throw new ProcessingError("no_audio", "Este vídeo não tem áudio para transcrever.");
  try {
    await assertWithinLimits(db, asset.orgId, "ai");
  } catch (e) {
    if (e instanceof LimitError) throw new ProcessingError("limit", e.message);
    throw e;
  }
  const file = await getStorage().materialize(asset.storageKey, ctx.tmpDir);
  try {
    ctx.progress(progressBase, "Gerando transcrição");
    const result = await provider.transcribe(file.path, {
      durationSec: asset.durationSec ?? 0,
      language: "pt",
      signal: ctx.signal,
      onProgress: (f) => ctx.progress(progressBase + f * progressSpan, "Gerando transcrição"),
    });
    const cost = estimateTranscriptionCost(asset.durationSec ?? 0);
    await db.transaction(async (tx) => {
      await tx
        .insert(transcripts)
        .values({
          orgId: asset.orgId,
          assetId: asset.id,
          provider: result.provider,
          model: result.model,
          language: result.language,
          text: result.text,
          words: result.words,
          segments: result.segments,
          durationSec: asset.durationSec,
          costUsd: cost,
        })
        .onConflictDoUpdate({
          target: transcripts.assetId,
          set: { provider: result.provider, model: result.model, text: result.text, words: result.words, segments: result.segments, costUsd: cost, createdAt: sql`now()` },
        });
      await tx.delete(segments).where(sql`${segments.assetId} = ${asset.id} AND ${segments.kind} = 'sentence'`);
      for (let i = 0; i < result.segments.length; i += 500) {
        await tx.insert(segments).values(
          result.segments.slice(i, i + 500).map((s) => ({ orgId: asset.orgId, assetId: asset.id, kind: "sentence", start: s.start, end: s.end, text: s.text })),
        );
      }
    });
    await recordUsage(db, { orgId: asset.orgId, projectId: asset.projectId, kind: "transcription_seconds", quantity: asset.durationSec ?? 0, costUsd: cost, meta: { provider: result.provider } });
    return result.segments.length;
  } finally {
    await file.cleanup();
  }
}

export async function handleTranscribe(ctx: JobContext): Promise<Record<string, unknown>> {
  const n = await transcribeAsset(ctx, ctx.job.assetId!);
  return { segments: n };
}
