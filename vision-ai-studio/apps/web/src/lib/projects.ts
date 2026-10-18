import "server-only";
import { PROJECT_STATUS_LABEL, type ProjectStatus, parseTimeline } from "@vision/core";
import {
  and,
  desc,
  eq,
  getDb,
  inArray,
  isNull,
  or,
  aiCommands,
  assets,
  contentSuggestions,
  brands,
  jobs,
  projects,
  renders,
  timelineVersions,
  transcripts,
} from "@vision/db";
import { capabilities } from "@vision/server";
import { notFound } from "./api";
import { assetDto, brandDto, jobDto, renderDto } from "./dto";

export async function getProjectForOrg(id: string, orgId: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound("Projeto");
  const [p] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  if (!p) throw notFound("Projeto");
  return p;
}

/** Tudo o que o estúdio precisa para abrir um projeto (critério 7: reabrir e recuperar). */
export async function projectDetail(id: string, orgId: string) {
  const db = getDb();
  const p = await getProjectForOrg(id, orgId);
  const brandRows = p.brandId ? await db.select().from(brands).where(eq(brands.id, p.brandId)) : [];
  const projectAssets = await db
    .select()
    .from(assets)
    .where(and(eq(assets.orgId, orgId), or(eq(assets.projectId, p.id), p.brandId ? eq(assets.brandId, p.brandId) : eq(assets.projectId, p.id))))
    .orderBy(assets.createdAt);
  const current0 = p.currentVersionId
    ? (await db.select().from(timelineVersions).where(eq(timelineVersions.id, p.currentVersionId)))[0]
    : undefined;
  if (current0) {
    // arquivos referenciados pela timeline (ex.: projeto duplicado reaproveita os vídeos de origem)
    const tl0 = parseTimeline(current0.timeline);
    const ref = new Set([...tl0.clips.map((c) => c.assetId), ...tl0.logos.map((l) => l.assetId), ...(tl0.audio.music ? [tl0.audio.music.assetId] : [])]);
    const missing = [...ref].filter((rid) => !projectAssets.some((a) => a.id === rid));
    if (missing.length) projectAssets.push(...(await db.select().from(assets).where(and(eq(assets.orgId, orgId), inArray(assets.id, missing)))));
  }
  const versions = await db
    .select({
      id: timelineVersions.id,
      number: timelineVersions.number,
      source: timelineVersions.source,
      summary: timelineVersions.summary,
      parentId: timelineVersions.parentId,
      createdAt: timelineVersions.createdAt,
    })
    .from(timelineVersions)
    .where(eq(timelineVersions.projectId, p.id))
    .orderBy(desc(timelineVersions.number))
    .limit(100);
  const current = current0;
  const commands = await db.select().from(aiCommands).where(eq(aiCommands.projectId, p.id)).orderBy(desc(aiCommands.createdAt)).limit(40);
  const [content] = await db.select().from(contentSuggestions).where(eq(contentSuggestions.projectId, p.id)).orderBy(desc(contentSuggestions.createdAt)).limit(1);
  const jobRows = await db.select().from(jobs).where(eq(jobs.projectId, p.id)).orderBy(desc(jobs.createdAt)).limit(40);
  const renderRows = await db.select().from(renders).where(eq(renders.projectId, p.id)).orderBy(desc(renders.createdAt)).limit(40);
  const sourceIds = projectAssets.filter((a) => a.role === "source").map((a) => a.id);
  const trs = sourceIds.length
    ? await db
        .select({ assetId: transcripts.assetId, provider: transcripts.provider, text: transcripts.text, language: transcripts.language })
        .from(transcripts)
        .where(inArray(transcripts.assetId, sourceIds))
    : [];
  const outputAssetIds = renderRows.flatMap((r) => [r.outputAssetId, r.srtAssetId]).filter(Boolean) as string[];
  const outputAssets = outputAssetIds.length ? await db.select().from(assets).where(inArray(assets.id, outputAssetIds)) : [];
  const assetsById = new Map(outputAssets.map((a) => [a.id, a]));

  return {
    project: {
      id: p.id,
      name: p.name,
      kind: p.kind,
      status: p.status as ProjectStatus,
      statusLabel: PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status,
      statusDetail: p.statusDetail,
      errorMessage: p.errorMessage,
      brandId: p.brandId,
      primaryPreset: p.primaryPreset,
      destinations: p.destinations,
      styleId: p.styleId,
      templateId: p.templateId,
      parentProjectId: p.parentProjectId,
      folder: p.folder,
      currentVersionId: p.currentVersionId,
      autopilot: p.autopilot,
      updatedAt: p.updatedAt.toISOString(),
    },
    brand: brandRows[0] ? await brandDto(brandRows[0], projectAssets) : null,
    assets: await Promise.all(projectAssets.filter((a) => a.role !== "render" && a.role !== "preview" && a.role !== "srt").map(assetDto)),
    timeline: current ? parseTimeline(current.timeline) : null,
    currentVersion: current ? { id: current.id, number: current.number } : null,
    versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    commands: commands.reverse().map((c) => ({
      id: c.id,
      text: c.text,
      status: c.status,
      engine: c.engine,
      model: c.model,
      reply: c.reply,
      applied: c.applied ?? [],
      warnings: c.warnings ?? [],
      unsupported: c.unsupported ?? [],
      resultVersionId: c.resultVersionId,
      costUsd: c.costUsd,
      errorMessage: c.errorMessage,
      createdAt: c.createdAt.toISOString(),
    })),
    jobs: jobRows.map(jobDto),
    renders: await Promise.all(
      renderRows.map(async (r) => {
        const out = r.outputAssetId ? assetsById.get(r.outputAssetId) : undefined;
        const srt = r.srtAssetId ? assetsById.get(r.srtAssetId) : undefined;
        return {
          ...renderDto(r),
          playUrl: out ? (await assetDto(out)).url : null,
          downloadUrl: out ? `/api/renders/${r.id}/download` : null,
          srtUrl: srt ? `/api/renders/${r.id}/download?file=srt` : null,
        };
      }),
    ),
    transcripts: trs.map((t) => ({ ...t, text: t.text.slice(0, 20000) })),
    content: content
      ? { id: content.id, status: content.status, data: content.data as Record<string, unknown> | null, model: content.model, costUsd: content.costUsd, errorMessage: content.errorMessage, versionId: content.versionId, createdAt: content.createdAt.toISOString() }
      : null,
    capabilities: capabilities(),
  };
}
export type ProjectDetail = Awaited<ReturnType<typeof projectDetail>>;
