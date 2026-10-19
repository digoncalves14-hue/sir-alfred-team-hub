import "server-only";
import type { Asset, Brand, Job, Project, Render } from "@vision/db";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@vision/core";
import { getStorage } from "@vision/server";

export async function signedUrl(key: string | null | undefined, downloadName?: string): Promise<string | null> {
  if (!key) return null;
  return getStorage().getDownloadUrl(key, downloadName ? { downloadName } : {});
}

export async function assetDto(a: Asset) {
  return {
    id: a.id,
    kind: a.kind,
    role: a.role,
    name: a.originalName,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    status: a.status,
    durationSec: a.durationSec,
    width: a.width,
    height: a.height,
    fps: a.fps,
    hasAudio: a.hasAudio,
    projectId: a.projectId,
    brandId: a.brandId,
    licenseNote: a.licenseNote,
    errorMessage: a.errorMessage,
    hasAnalysis: Boolean(a.analysis),
    bpm: a.role === "music" ? ((a.analysis as { bpm?: number | null } | null)?.bpm ?? null) : null,
    createdAt: a.createdAt.toISOString(),
    // a prévia usa a cópia leve quando existe; downloads e render usam o original
    url: a.status === "ready" || a.status === "processing" ? await signedUrl(a.proxyKey ?? a.storageKey) : null,
    thumbnailUrl: await signedUrl(a.thumbnailKey),
  };
}
export type AssetDto = Awaited<ReturnType<typeof assetDto>>;

export async function projectCardDto(p: Project, brandName: string | null) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    status: p.status as ProjectStatus,
    statusLabel: PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status,
    statusDetail: p.statusDetail,
    errorMessage: p.errorMessage,
    brandId: p.brandId,
    brandName,
    primaryPreset: p.primaryPreset,
    folder: p.folder,
    thumbnailUrl: await signedUrl(p.thumbnailKey),
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}
export type ProjectCardDto = Awaited<ReturnType<typeof projectCardDto>>;

export function jobDto(j: Job) {
  return {
    id: j.id,
    type: j.type,
    status: j.status,
    progress: j.progress,
    stage: j.stage,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    errorMessage: j.errorMessage,
    assetId: j.assetId,
    createdAt: j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
    processingMs: j.processingMs,
  };
}
export type JobDto = ReturnType<typeof jobDto>;

export function renderDto(r: Render) {
  return {
    id: r.id,
    kind: r.kind,
    preset: r.preset,
    status: r.status,
    progress: r.progress,
    versionId: r.versionId,
    settings: r.settings as Record<string, unknown>,
    durationSec: r.durationSec,
    width: r.width,
    height: r.height,
    sizeBytes: r.sizeBytes,
    errorMessage: r.errorMessage,
    jobId: r.jobId,
    outputAssetId: r.outputAssetId,
    srtAssetId: r.srtAssetId,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}
export type RenderDto = ReturnType<typeof renderDto>;

export async function brandDto(b: Brand, assets: Asset[] = []) {
  const logo = assets.find((a) => a.id === b.logoAssetId);
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    segment: b.segment,
    tone: b.tone,
    contentTypes: b.contentTypes,
    colors: b.colors,
    fonts: b.fonts,
    defaultStyleId: b.defaultStyleId,
    notes: b.notes,
    logoAssetId: b.logoAssetId,
    logoUrl: logo ? await signedUrl(logo.storageKey) : null,
    musicAssetIds: b.musicAssetIds,
  };
}
export type BrandDto = Awaited<ReturnType<typeof brandDto>>;
