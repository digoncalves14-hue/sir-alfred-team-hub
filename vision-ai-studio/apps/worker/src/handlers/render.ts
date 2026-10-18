import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FORMAT_PRESETS,
  type FormatPresetId,
  RenderSettingsSchema,
  buildRenderCommand,
  captionCues,
  parseTimeline,
  renderDimensions,
  resolutionAllowed,
  toAss,
  toSrt,
  type RenderAsset,
} from "@vision/core";
import { eq, inArray, assets, projects, renders, timelineVersions } from "@vision/db";
import {
  LimitError,
  ProcessingError,
  assertWithinLimits,
  getConfig,
  getStorage,
  makeStorageKey,
  recordUsage,
} from "@vision/server";
import { ffmpeg, probeFile } from "@vision/server/node";
import type { JobContext } from "../context";

/** Renderização real: timeline → FFmpeg → MP4 H.264 + SRT, com progresso e verificação. */
export async function handleRender(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const renderId = String(job.payload.renderId ?? "");
  const [render] = await db.select().from(renders).where(eq(renders.id, renderId));
  if (!render) throw new ProcessingError("not_found", "Renderização não encontrada.");
  const [version] = await db.select().from(timelineVersions).where(eq(timelineVersions.id, render.versionId));
  if (!version) throw new ProcessingError("not_found", "Versão do projeto não encontrada.");
  const [project] = await db.select().from(projects).where(eq(projects.id, render.projectId));
  try {
    await assertWithinLimits(db, render.orgId, "render");
  } catch (e) {
    if (e instanceof LimitError) throw new ProcessingError("limit", e.message);
    throw e;
  }
  await db.update(renders).set({ status: "running", progress: 0 }).where(eq(renders.id, render.id));

  const base = parseTimeline(version.timeline);
  const timeline = parseTimeline({ ...base, format: { ...base.format, preset: render.preset as FormatPresetId } });
  const settings = RenderSettingsSchema.parse({
    ...(render.settings as object),
    ...(render.kind === "preview" ? { shortSideOverride: 480, encoderPreset: "ultrafast" } : {}),
  });

  const ids = new Set<string>([...timeline.clips.map((c) => c.assetId), ...timeline.logos.map((l) => l.assetId)]);
  if (timeline.audio.music) ids.add(timeline.audio.music.assetId);
  const rows = await db.select().from(assets).where(inArray(assets.id, [...ids]));
  const storage = getStorage();
  const cleanups: Array<() => Promise<void>> = [];
  try {
    ctx.progress(0.01, "Preparando arquivos");
    const inputs = {
      assets: new Map<string, RenderAsset>(),
      images: new Map<string, string>(),
      audios: new Map<string, string>(),
      assPath: null as string | null,
      fontsDir: getConfig().FONTS_DIR ?? null,
    };
    for (const row of rows) {
      if (row.orgId !== render.orgId) throw new ProcessingError("forbidden", "Arquivo de outra organização.");
      if (row.status !== "ready") throw new ProcessingError("not_ready", `O arquivo "${row.originalName}" ainda não está pronto.`);
      const f = await storage.materialize(row.storageKey, ctx.tmpDir);
      cleanups.push(f.cleanup);
      if (row.role === "logo" || row.kind === "image") inputs.images.set(row.id, f.path);
      else if (row.role === "music" || row.kind === "audio") inputs.audios.set(row.id, f.path);
      else
        inputs.assets.set(row.id, {
          path: f.path,
          width: row.width ?? 1920,
          height: row.height ?? 1080,
          hasAudio: Boolean(row.hasAudio),
          hasVideo: true,
          duration: row.durationSec ?? 0,
        });
    }
    const first = rows.find((r) => r.role === "source");
    if (render.kind === "export" && first && !resolutionAllowed(settings.resolution, first.width ?? 0, first.height ?? 0)) {
      throw new ProcessingError("resolution", "A exportação em 4K exige vídeo de origem com resolução 4K (ou pelo menos 1440p).");
    }

    const { width, height } = renderDimensions(timeline, settings);
    let srtAssetId: string | null = null;
    if (timeline.captions.enabled) {
      const cues = captionCues(timeline);
      if (cues.length) {
        inputs.assPath = path.join(ctx.tmpDir, "legendas.ass");
        await writeFile(inputs.assPath, toAss(timeline, cues, { width, height }), "utf8");
        if (render.kind === "export") {
          const srtKey = makeStorageKey(render.orgId, "subtitles", "srt");
          const srt = Buffer.from(toSrt(cues), "utf8");
          await storage.putBuffer(srtKey, srt, "application/x-subrip");
          const [srtAsset] = await db
            .insert(assets)
            .values({
              orgId: render.orgId,
              projectId: render.projectId,
              kind: "subtitle",
              role: "srt",
              originalName: `${slug(project?.name ?? "legendas")}-${render.preset}.srt`,
              mime: "application/x-subrip",
              sizeBytes: srt.length,
              storageKey: srtKey,
              status: "ready",
            })
            .returning();
          srtAssetId = srtAsset.id;
        }
      }
    }

    const outPath = path.join(ctx.tmpDir, "saida.mp4");
    const graphPath = path.join(ctx.tmpDir, "filtros.txt");
    const cmd = buildRenderCommand(timeline, inputs, settings, outPath, graphPath);
    await writeFile(graphPath, cmd.filterGraph, "utf8");
    const started = Date.now();
    let lastSaved = 0;
    ctx.progress(0.02, "Renderizando");
    await ffmpeg(cmd.args, {
      signal: ctx.signal,
      expectedDurationSec: cmd.durationSec,
      onProgress: (f) => {
        const p = 0.02 + f * 0.93;
        ctx.progress(p, "Renderizando");
        if (Date.now() - lastSaved > 1500) {
          lastSaved = Date.now();
          void db.update(renders).set({ progress: p }).where(eq(renders.id, render.id));
        }
      },
    });

    ctx.progress(0.96, "Verificando arquivo final");
    const probe = await probeFile(outPath);
    if (!probe.hasVideo || Math.abs(probe.durationSec - cmd.durationSec) > Math.max(1, cmd.durationSec * 0.05)) {
      throw new ProcessingError("verify_failed", "O arquivo renderizado não passou na verificação de duração.", true);
    }
    const key = makeStorageKey(render.orgId, render.kind === "preview" ? "previews" : "renders", "mp4");
    ctx.progress(0.97, "Salvando arquivo");
    const size = await storage.uploadFile(outPath, key, "video/mp4");
    const presetLabel = FORMAT_PRESETS[timeline.format.preset].label.replace(/[()]/g, "").replace(/\s+/g, "-");
    const [out] = await db
      .insert(assets)
      .values({
        orgId: render.orgId,
        projectId: render.projectId,
        kind: "video",
        role: render.kind === "preview" ? "preview" : "render",
        originalName: `${slug(project?.name ?? "video")}-${presetLabel}-${settings.resolution}.mp4`,
        mime: "video/mp4",
        sizeBytes: size,
        storageKey: key,
        status: "ready",
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
      })
      .returning();
    await db
      .update(renders)
      .set({
        status: "succeeded",
        progress: 1,
        outputAssetId: out.id,
        srtAssetId,
        durationSec: probe.durationSec,
        width: probe.width,
        height: probe.height,
        sizeBytes: size,
        finishedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(renders.id, render.id));
    await recordUsage(db, {
      orgId: render.orgId,
      projectId: render.projectId,
      kind: "render_seconds",
      quantity: probe.durationSec,
      meta: { renderId: render.id, processingMs: Date.now() - started, preset: render.preset, kind: render.kind },
    });
    return { outputAssetId: out.id, sizeBytes: size, durationSec: probe.durationSec };
  } finally {
    for (const c of cleanups) await c().catch(() => {});
  }
}

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "video"
  );
}
