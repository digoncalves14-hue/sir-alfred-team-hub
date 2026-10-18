import {
  type AssetAnalysis,
  type BrandContext,
  type ProjectStatus,
  type SourceMap,
  type Timeline,
  type TranscriptData,
  parseTimeline,
} from "@vision/core";
import {
  and,
  desc,
  eq,
  inArray,
  sql,
  type Db,
  type Project,
  assets,
  brands,
  projects,
  timelineVersions,
  transcripts,
} from "@vision/db";

export async function loadSources(db: Db, assetIds: string[]): Promise<SourceMap> {
  const map: SourceMap = new Map();
  if (!assetIds.length) return map;
  const rows = await db.select().from(assets).where(inArray(assets.id, assetIds));
  const trs = await db.select().from(transcripts).where(inArray(transcripts.assetId, assetIds));
  for (const a of rows) {
    const t = trs.find((x) => x.assetId === a.id);
    map.set(a.id, {
      assetId: a.id,
      duration: a.durationSec ?? 0,
      analysis: (a.analysis as AssetAnalysis | null) ?? null,
      transcript: t ? ({ language: t.language, text: t.text, words: t.words, segments: t.segments } satisfies TranscriptData) : null,
    });
  }
  return map;
}

export async function getCurrentVersion(db: Db, project: Pick<Project, "id" | "currentVersionId">) {
  if (project.currentVersionId) {
    const [v] = await db.select().from(timelineVersions).where(eq(timelineVersions.id, project.currentVersionId));
    if (v) return { version: v, timeline: parseTimeline(v.timeline) };
  }
  const [v] = await db
    .select()
    .from(timelineVersions)
    .where(eq(timelineVersions.projectId, project.id))
    .orderBy(desc(timelineVersions.number))
    .limit(1);
  return v ? { version: v, timeline: parseTimeline(v.timeline) } : null;
}

/** Cria uma nova versão imutável da timeline e a torna a versão atual do projeto. */
export async function createVersion(
  db: Db,
  input: {
    orgId: string;
    projectId: string;
    timeline: Timeline;
    source: "initial" | "ai" | "manual" | "restore";
    summary: string;
    parentId?: string | null;
    aiCommandId?: string | null;
    userId?: string | null;
  },
) {
  const timeline = parseTimeline(input.timeline);
  return db.transaction(async (tx) => {
    // trava a linha do projeto para numerar versões sem corrida
    await tx.execute(sql`SELECT id FROM projects WHERE id = ${input.projectId} FOR UPDATE`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${timelineVersions.number}), 0) + 1` })
      .from(timelineVersions)
      .where(eq(timelineVersions.projectId, input.projectId));
    const [v] = await tx
      .insert(timelineVersions)
      .values({
        orgId: input.orgId,
        projectId: input.projectId,
        number: Number(next),
        parentId: input.parentId ?? null,
        timeline,
        source: input.source,
        summary: input.summary.slice(0, 1000),
        aiCommandId: input.aiCommandId ?? null,
        createdBy: input.userId ?? null,
      })
      .returning();
    await tx.update(projects).set({ currentVersionId: v.id, updatedAt: new Date() }).where(eq(projects.id, input.projectId));
    return v;
  });
}

export async function setProjectStatus(
  db: Db,
  projectId: string,
  status: ProjectStatus,
  detail: string | null = null,
  errorMessage: string | null = null,
): Promise<void> {
  await db
    .update(projects)
    .set({ status, statusDetail: detail, errorMessage, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export async function loadBrandContext(db: Db, orgId: string, brandId: string | null | undefined) {
  if (!brandId) return null;
  const [b] = await db.select().from(brands).where(and(eq(brands.id, brandId), eq(brands.orgId, orgId)));
  if (!b) return null;
  const ctx: BrandContext & { segment: string; tone: string } = {
    id: b.id,
    name: b.name,
    logoAssetId: b.logoAssetId,
    musicAssetIds: b.musicAssetIds,
    primaryColor: b.colors[0] ?? null,
    defaultStyleId: b.defaultStyleId,
    segment: b.segment,
    tone: b.tone,
  };
  return ctx;
}
