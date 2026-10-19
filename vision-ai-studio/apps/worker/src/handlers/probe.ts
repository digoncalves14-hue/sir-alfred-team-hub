import path from "node:path";
import { initialTimeline, newClipId, parseTimeline } from "@vision/core";
import { and, eq, enqueueJob, assets, brands, projects } from "@vision/db";
import { ProcessingError, createVersion, getConfig, getCurrentVersion, getStorage, makeStorageKey } from "@vision/server";
import { analyzeMusic, extractThumbnail, probeFile } from "@vision/server/node";
import type { JobContext } from "../context";

/** Leitura técnica do arquivo (ffprobe), validação, miniatura e timeline inicial. */
export async function handleProbe(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const [asset] = await db.select().from(assets).where(eq(assets.id, job.assetId!));
  if (!asset) throw new ProcessingError("not_found", "Arquivo não encontrado.");
  const storage = getStorage();
  ctx.progress(0.05, "Lendo arquivo");
  const file = await storage.materialize(asset.storageKey, ctx.tmpDir);
  try {
    const probe = await probeFile(file.path, ctx.signal);
    const cfg = getConfig();
    if (asset.role === "source") {
      if (!probe.hasVideo) throw new ProcessingError("no_video", "O arquivo enviado não contém uma trilha de vídeo.");
      if (probe.durationSec <= 0.3) throw new ProcessingError("too_short", "O vídeo é curto demais ou não tem duração legível.");
      if (probe.durationSec > cfg.MAX_SOURCE_DURATION_MIN * 60) {
        throw new ProcessingError("too_long", `O vídeo excede o limite de ${cfg.MAX_SOURCE_DURATION_MIN} minutos.`);
      }
      if (!probe.width || !probe.height) throw new ProcessingError("invalid_media", "Não foi possível ler as dimensões do vídeo.");
    }
    if (asset.role === "music" && !probe.hasAudio) throw new ProcessingError("no_audio", "O arquivo de música não contém áudio.");
    if (asset.role === "logo" && (!probe.width || !probe.height)) throw new ProcessingError("invalid_image", "A imagem da logo não pôde ser lida.");

    let thumbnailKey: string | null = null;
    if (asset.role === "source") {
      ctx.progress(0.5, "Gerando miniatura");
      const thumbPath = path.join(ctx.tmpDir, "thumb.jpg");
      await extractThumbnail(file.path, thumbPath, Math.min(probe.durationSec * 0.1, 5));
      thumbnailKey = makeStorageKey(asset.orgId, "thumbnails", "jpg");
      await storage.uploadFile(thumbPath, thumbnailKey, "image/jpeg");
    }

    let musicAnalysis: Record<string, unknown> | null = null;
    if (asset.role === "music") {
      ctx.progress(0.5, "Analisando ritmo da música");
      try {
        musicAnalysis = (await analyzeMusic(file.path, probe.durationSec, ctx.signal)) as unknown as Record<string, unknown>;
      } catch (err) {
        ctx.log.warn("music_analysis_failed", { err });
      }
    }

    await db
      .update(assets)
      .set({
        ...(musicAnalysis ? { analysis: musicAnalysis } : {}),
        probe: probe as unknown as Record<string, unknown>,
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        thumbnailKey,
        status: asset.role === "source" ? "processing" : "ready",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id));

    // arquivos oficiais enviados em "Minhas Marcas" passam a valer para a marca
    if (asset.brandId && (asset.role === "logo" || asset.role === "music")) {
      const [brand] = await db.select().from(brands).where(eq(brands.id, asset.brandId));
      if (brand && asset.role === "logo") await db.update(brands).set({ logoAssetId: asset.id, updatedAt: new Date() }).where(eq(brands.id, brand.id));
      if (brand && asset.role === "music" && !brand.musicAssetIds.includes(asset.id)) {
        await db.update(brands).set({ musicAssetIds: [...brand.musicAssetIds, asset.id], updatedAt: new Date() }).where(eq(brands.id, brand.id));
      }
    }

    if (asset.role === "source" && asset.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, asset.projectId));
      if (project && !project.thumbnailKey && thumbnailKey) {
        await db.update(projects).set({ thumbnailKey }).where(eq(projects.id, project.id));
      }
      if (project) await addToTimeline(ctx, project.id, asset.id, probe.durationSec, probe.fps);
      await enqueueJob(db, { orgId: asset.orgId, projectId: asset.projectId, assetId: asset.id, type: "analyze", priority: job.priority });
    }
    return { durationSec: probe.durationSec, width: probe.width, height: probe.height };
  } finally {
    await file.cleanup();
  }
}

/** Cria a timeline inicial quando todos os vídeos foram lidos, ou acrescenta vídeos novos. */
async function addToTimeline(ctx: JobContext, projectId: string, assetId: string, durationSec: number, fps: number | null) {
  const { db } = ctx;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return;
  const current = await getCurrentVersion(db, project);
  if (current) {
    if (current.timeline.clips.some((c) => c.assetId === assetId)) return;
    const tl = parseTimeline({
      ...current.timeline,
      clips: [...current.timeline.clips, { id: newClipId(), assetId, sourceStart: 0, sourceEnd: durationSec }],
    });
    await createVersion(db, { orgId: project.orgId, projectId, timeline: tl, source: "manual", summary: "Vídeo adicionado ao projeto", parentId: current.version.id });
    return;
  }
  const sources = await db.select().from(assets).where(and(eq(assets.projectId, projectId), eq(assets.role, "source")));
  const ready = sources.filter((s) => s.durationSec && s.status !== "pending_upload" && s.status !== "error");
  const stillWaiting = sources.some((s) => s.id !== assetId && (s.status === "uploaded" || s.status === "pending_upload"));
  if (stillWaiting) return;
  const ordered = ready.sort((a, b) => +a.createdAt - +b.createdAt).map((s) => ({ id: s.id, durationSec: s.id === assetId ? durationSec : s.durationSec!, fps: s.id === assetId ? fps : s.fps }));
  const tl = initialTimeline(ordered, project.primaryPreset as never, { brandId: project.brandId, styleId: project.styleId });
  await createVersion(db, { orgId: project.orgId, projectId, timeline: tl, source: "initial", summary: "Versão inicial (vídeos completos, sem cortes)" });
}
