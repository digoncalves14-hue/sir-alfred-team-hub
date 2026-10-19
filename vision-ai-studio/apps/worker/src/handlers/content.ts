import { captionCues, placeClips, timelineDuration } from "@vision/core";
import { eq, contentSuggestions, projects, timelineVersions } from "@vision/db";
import { ProcessingError, capabilities, getCurrentVersion, loadBrandContext, loadSources, recordUsage, assertWithinLimits, LimitError } from "@vision/server";
import { generateContent } from "@vision/server/node";
import type { JobContext } from "../context";
import { sampleFrames } from "./ai-command";

/** Gera títulos, descrições, legendas e hashtags a partir do conteúdo REAL do vídeo editado. */
export async function handleGenerateContent(ctx: JobContext): Promise<Record<string, unknown>> {
  const { db, job } = ctx;
  const id = String(job.payload.contentId ?? "");
  const [row] = await db.select().from(contentSuggestions).where(eq(contentSuggestions.id, id));
  if (!row) throw new ProcessingError("not_found", "Pedido de textos não encontrado.");
  const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
  if (!project) throw new ProcessingError("not_found", "Projeto não encontrado.");
  try {
    await assertWithinLimits(db, project.orgId, "ai");
  } catch (e) {
    if (e instanceof LimitError) throw new ProcessingError("limit", e.message);
    throw e;
  }
  await db.update(contentSuggestions).set({ status: "running" }).where(eq(contentSuggestions.id, id));
  const current = await getCurrentVersion(db, project);
  if (!current) throw new ProcessingError("not_ready", "O projeto ainda não tem vídeos processados.");
  const sources = await loadSources(db, [...new Set(current.timeline.clips.map((c) => c.assetId))]);
  // fala que realmente ficou no vídeo final
  const speech = placeClips(current.timeline)
    .flatMap((p) => sources.get(p.clip.assetId)?.transcript?.words.filter((w) => w.start >= p.clip.sourceStart && w.end <= p.clip.sourceEnd).map((w) => w.text) ?? [])
    .join(" ");
  const fallbackCaptions = captionCues({ ...current.timeline, captions: { ...current.timeline.captions, enabled: true } }).map((c) => c.text).join(" ");
  const brand = await loadBrandContext(db, project.orgId, project.brandId);
  const history = await db.select({ summary: timelineVersions.summary }).from(timelineVersions).where(eq(timelineVersions.projectId, project.id));
  ctx.progress(0.2, "Amostrando quadros do vídeo");
  const frames = capabilities().visionFrames > 0 ? await sampleFrames(ctx, current.timeline, Math.min(6, capabilities().visionFrames)) : [];
  ctx.progress(0.5, "Escrevendo textos com IA");
  const out = await generateContent({
    projectName: project.name,
    brand: brand ? { name: brand.name, segment: brand.segment, tone: brand.tone, contentTypes: [] } : null,
    destinations: project.destinations,
    durationSec: timelineDuration(current.timeline),
    transcript: speech || fallbackCaptions || null,
    editSummary: history.map((h) => h.summary),
    frames,
  });
  await db.update(contentSuggestions).set({ status: "succeeded", data: out.data, model: out.model, costUsd: out.costUsd, versionId: current.version.id }).where(eq(contentSuggestions.id, id));
  await recordUsage(db, { orgId: project.orgId, projectId: project.id, kind: "ai_tokens", quantity: 0, costUsd: out.costUsd, meta: { purpose: "content", model: out.model } });
  return { ok: true };
}
