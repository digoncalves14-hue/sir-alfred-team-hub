import { readFile } from "node:fs/promises";
import path from "node:path";
import { SYSTEM_TEMPLATES, applyEditPlan, diffTimelines, outputTimeToSource, placeClips, round3, timelineDuration, type Timeline } from "@vision/core";
import { and, desc, eq, inArray, ne, or, aiCommands, assets, projects, templates } from "@vision/db";
import {
  LimitError,
  ProcessingError,
  assertWithinLimits,
  capabilities,
  createVersion,
  getCurrentVersion,
  getStorage,
  loadBrandContext,
  loadMusicAnalyses,
  loadSources,
  loadVoiceovers,
  recordUsage,
} from "@vision/server";
import { extractFrames, planEdit, type PlannerFrame } from "@vision/server/node";
import type { JobContext } from "../context";
import { transcribeAsset } from "./transcribe";
import { resolveGenerativeOps } from "./generate-audio";

/**
 * Comando de edição: linguagem natural → plano JSON validado (IA ou interpretador
 * local) → motor determinístico → nova versão da timeline.
 */
export async function handleAiCommand(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const commandId = String(job.payload.commandId ?? "");
  const [cmd] = await db.select().from(aiCommands).where(eq(aiCommands.id, commandId));
  if (!cmd) throw new ProcessingError("not_found", "Comando não encontrado.");
  const [project] = await db.select().from(projects).where(eq(projects.id, cmd.projectId));
  if (!project) throw new ProcessingError("not_found", "Projeto não encontrado.");
  await db.update(aiCommands).set({ status: "running" }).where(eq(aiCommands.id, cmd.id));

  const current = await getCurrentVersion(db, project);
  if (!current) throw new ProcessingError("not_ready", "O projeto ainda não tem vídeos processados.");
  const caps = capabilities();
  if (caps.ai) {
    try {
      await assertWithinLimits(db, project.orgId, "ai");
    } catch (e) {
      if (e instanceof LimitError) throw new ProcessingError("limit", e.message);
      throw e;
    }
  }

  const assetIds = [...new Set(current.timeline.clips.map((c) => c.assetId))];
  let sources = await loadSources(db, assetIds);
  const brand = await loadBrandContext(db, project.orgId, project.brandId);
  const musicRows = await db
    .select({ id: assets.id, name: assets.originalName })
    .from(assets)
    .where(
      and(
        eq(assets.orgId, project.orgId),
        eq(assets.role, "music"),
        eq(assets.status, "ready"),
        or(eq(assets.projectId, project.id), project.brandId ? eq(assets.brandId, project.brandId) : eq(assets.projectId, project.id)),
      ),
    );
  const history = await db
    .select({ text: aiCommands.text, reply: aiCommands.reply })
    .from(aiCommands)
    .where(and(eq(aiCommands.projectId, project.id), ne(aiCommands.id, cmd.id), eq(aiCommands.status, "applied")))
    .orderBy(desc(aiCommands.createdAt))
    .limit(4);

  ctx.progress(0.1, "Interpretando o pedido");
  const frames = caps.ai && caps.visionFrames > 0 ? await sampleFrames(ctx, current.timeline, caps.visionFrames) : [];
  ctx.progress(0.3, frames.length ? `Analisando ${frames.length} quadros com IA` : "Planejando a edição");
  const planned = await planEdit({
    command: cmd.text,
    timeline: current.timeline,
    sources,
    brand,
    musicAssets: musicRows,
    frames,
    history: history.reverse(),
    templateGuidance: await templateGuidance(ctx, project.templateId, project.orgId),
  });

  // trilha e narração geradas por IA (ElevenLabs) viram arquivos do projeto antes do motor
  const gen = await resolveGenerativeOps(ctx, project, current.timeline, planned.plan.operations);
  planned.plan.operations = gen.operations;
  if (gen.generated.length) {
    const fresh = await db
      .select({ id: assets.id, name: assets.originalName })
      .from(assets)
      .where(and(inArray(assets.id, gen.generated), eq(assets.role, "music")));
    musicRows.push(...fresh.filter((f) => !musicRows.some((m) => m.id === f.id)));
  }

  // legendas precisam de transcrição: transcreve antes de aplicar, se possível
  const wantsCaptions = planned.plan.operations.some((o) => o.op === "set_captions" && o.enabled);
  const preWarnings: string[] = [];
  if (wantsCaptions) {
    const missing = assetIds.filter((id) => !sources.get(id)?.transcript);
    if (missing.length && caps.transcription) {
      for (const [i, id] of missing.entries()) {
        const [a] = await db.select({ hasAudio: assets.hasAudio }).from(assets).where(eq(assets.id, id));
        if (!a?.hasAudio) continue;
        await transcribeAsset(ctx, id, 0.4 + (0.4 * i) / missing.length, 0.4 / missing.length);
      }
      sources = await loadSources(db, assetIds);
    } else if (missing.length) {
      preWarnings.push("A transcrição automática não está configurada no servidor; as legendas não puderam ser geradas.");
    }
  }

  ctx.progress(0.85, "Aplicando edição");
  let result;
  try {
    result = applyEditPlan(current.timeline, planned.plan, {
      sources,
      brand,
      musicAssetIds: musicRows.map((m) => m.id),
      musicAnalyses: await loadMusicAnalyses(db, [...musicRows.map((m) => m.id), ...(brand?.musicAssetIds ?? [])]),
      ...(await loadVoiceovers(db, project.id).then((v) => ({ voiceoverAssetIds: v.ids, voiceoverTranscripts: v.transcripts }))),
    });
  } catch (err) {
    throw new ProcessingError("edit_rejected", (err as Error).message);
  }
  const changed = JSON.stringify(result.timeline) !== JSON.stringify(current.timeline);
  let versionId: string | null = null;
  if (changed) {
    const v = await createVersion(db, {
      orgId: project.orgId,
      projectId: project.id,
      timeline: result.timeline,
      source: "ai",
      summary: result.applied.join(" ") || cmd.text,
      parentId: current.version.id,
      aiCommandId: cmd.id,
      userId: cmd.userId,
    });
    versionId = v.id;
  }
  const warnings = [...preWarnings, ...result.warnings];
  if (planned.fallbackReason) warnings.unshift(planned.fallbackReason);
  await db
    .update(aiCommands)
    .set({
      status: changed ? "applied" : "no_changes",
      engine: planned.engine,
      model: planned.model,
      plan: planned.plan,
      reply: planned.plan.reply,
      applied: result.applied,
      warnings,
      unsupported: result.unsupported,
      baseVersionId: current.version.id,
      resultVersionId: versionId,
      inputTokens: planned.inputTokens,
      outputTokens: planned.outputTokens,
      costUsd: planned.costUsd,
      finishedAt: new Date(),
    })
    .where(eq(aiCommands.id, cmd.id));
  if (planned.inputTokens || planned.outputTokens) {
    await recordUsage(db, {
      orgId: project.orgId,
      projectId: project.id,
      kind: "ai_tokens",
      quantity: planned.inputTokens + planned.outputTokens,
      costUsd: planned.costUsd,
      meta: { model: planned.model, commandId: cmd.id, frames: frames.length },
    });
  }
  return {
    changed,
    versionId,
    engine: planned.engine,
    duration: timelineDuration(result.timeline),
    diff: changed ? diffTimelines(current.timeline, result.timeline) : [],
  };
}

async function templateGuidance(ctx: JobContext, templateId: string | null, orgId: string): Promise<string | null> {
  if (!templateId) return null;
  const sys = SYSTEM_TEMPLATES.find((t) => t.id === templateId);
  if (sys) return sys.config.aiGuidance || null;
  const [row] = await ctx.db.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.orgId, orgId)));
  return (row?.config as { aiGuidance?: string } | undefined)?.aiGuidance || null;
}

/** Amostra quadros ao longo do vídeo final atual para a análise visual multimodal. */
export async function sampleFrames(ctx: JobContext, tl: Timeline, count: number): Promise<PlannerFrame[]> {
  const total = placeClips(tl).at(-1)?.outEnd ?? 0;
  if (total <= 0) return [];
  const n = Math.min(count, Math.max(2, Math.floor(total / 2)));
  const times = Array.from({ length: n }, (_, i) => round3(((i + 0.5) * total) / n));
  const byAsset = new Map<string, Array<{ out: number; src: number }>>();
  for (const t of times) {
    const m = outputTimeToSource(tl, t);
    if (!m) continue;
    byAsset.set(m.assetId, [...(byAsset.get(m.assetId) ?? []), { out: t, src: m.sourceTime }]);
  }
  const rows = await ctx.db.select().from(assets).where(inArray(assets.id, [...byAsset.keys()]));
  const frames: PlannerFrame[] = [];
  for (const row of rows) {
    const list = byAsset.get(row.id)!;
    const file = await getStorage().materialize(row.storageKey, ctx.tmpDir);
    try {
      const dir = path.join(ctx.tmpDir, `frames_${row.id}`);
      const paths = await extractFrames(file.path, list.map((l) => l.src), dir, 512, ctx.signal);
      for (const [i, p] of paths.entries()) {
        frames.push({ outputTime: list[i].out, jpegBase64: (await readFile(p)).toString("base64") });
      }
    } catch (err) {
      ctx.log.warn("frame_extraction_failed", { err });
    } finally {
      await file.cleanup();
    }
  }
  return frames.sort((a, b) => a.outputTime - b.outputTime);
}
