import { and, eq, gte, sql, type Db, assets, organizations, usageEvents } from "@vision/db";
import { getConfig } from "./config";

export type UsageKind = "ai_tokens" | "transcription_seconds" | "render_seconds" | "analysis_seconds" | "storage_bytes";

export async function recordUsage(
  db: Db,
  e: { orgId: string; projectId?: string | null; kind: UsageKind; quantity: number; costUsd?: number; meta?: Record<string, unknown> },
): Promise<void> {
  await db.insert(usageEvents).values({
    orgId: e.orgId,
    projectId: e.projectId ?? null,
    kind: e.kind,
    quantity: e.quantity,
    costUsd: e.costUsd ?? 0,
    meta: e.meta ?? null,
  });
}

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export interface UsageSummary {
  aiCostUsd: number;
  aiBudgetUsd: number;
  renderMinutes: number;
  renderLimitMinutes: number;
  storageBytes: number;
  storageLimitBytes: number;
  transcriptionMinutes: number;
}

export async function getUsageSummary(db: Db, orgId: string): Promise<UsageSummary> {
  const c = getConfig();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const rows = await db
    .select({ kind: usageEvents.kind, qty: sql<number>`coalesce(sum(${usageEvents.quantity}),0)::float`, cost: sql<number>`coalesce(sum(${usageEvents.costUsd}),0)::float` })
    .from(usageEvents)
    .where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.createdAt, monthStart())))
    .groupBy(usageEvents.kind);
  const by = Object.fromEntries(rows.map((r) => [r.kind, r]));
  const [storage] = await db
    .select({ total: sql<number>`coalesce(sum(${assets.sizeBytes}),0)::float` })
    .from(assets)
    .where(eq(assets.orgId, orgId));
  return {
    aiCostUsd: (by.ai_tokens?.cost ?? 0) + (by.transcription_seconds?.cost ?? 0),
    aiBudgetUsd: org?.monthlyAiBudgetUsd ?? c.MONTHLY_AI_BUDGET_USD,
    renderMinutes: (by.render_seconds?.qty ?? 0) / 60,
    renderLimitMinutes: org?.monthlyRenderMinutes ?? c.MONTHLY_RENDER_MINUTES,
    storageBytes: storage?.total ?? 0,
    storageLimitBytes: org?.storageLimitBytes ?? c.STORAGE_LIMIT_GB * 1024 ** 3,
    transcriptionMinutes: (by.transcription_seconds?.qty ?? 0) / 60,
  };
}

export class LimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitError";
  }
}

export async function assertWithinLimits(db: Db, orgId: string, kind: "ai" | "render" | "storage", extraBytes = 0): Promise<void> {
  const u = await getUsageSummary(db, orgId);
  if (kind === "ai" && u.aiCostUsd >= u.aiBudgetUsd) {
    throw new LimitError(`O limite mensal de IA (US$ ${u.aiBudgetUsd.toFixed(2)}) foi atingido.`);
  }
  if (kind === "render" && u.renderMinutes >= u.renderLimitMinutes) {
    throw new LimitError(`O limite mensal de renderização (${u.renderLimitMinutes} min) foi atingido.`);
  }
  if (kind === "storage" && u.storageBytes + extraBytes > u.storageLimitBytes) {
    throw new LimitError("O limite de armazenamento da organização seria ultrapassado. Exclua arquivos antigos ou amplie o plano.");
  }
}
