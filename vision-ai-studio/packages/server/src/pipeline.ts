import { FORMAT_PRESET_IDS, type ProjectStatus, RenderSettingsSchema, type FormatPresetId } from "@vision/core";
import { and, desc, eq, type Db, assets, enqueueJob, jobs, projects, renders } from "@vision/db";
import { setProjectStatus } from "./projects";

export const ACTIVE = ["queued", "running"];

/**
 * Recalcula o status do projeto a partir das tarefas reais (nunca um status "fake"):
 * prioridade para o que está em execução; depois falhas recentes; depois o resultado.
 */
export async function refreshProjectStatus(db: Db, projectId: string): Promise<ProjectStatus> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return "draft";
  const recent = await db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(50);
  const active = recent.filter((j) => ACTIVE.includes(j.status));
  let status: ProjectStatus;
  let detail: string | null = null;
  let error: string | null = null;
  if (active.length) {
    const running = active.filter((j) => j.status === "running");
    const pick = (types: string[]) => (running.length ? running : active).some((j) => types.includes(j.type));
    if (pick(["render"])) status = "rendering";
    else if (pick(["ai_command"])) status = "selecting";
    else if (pick(["transcribe"])) status = "transcribing";
    else if (pick(["probe", "analyze", "thumbnail"])) status = running.length ? "analyzing" : "queued";
    else status = "queued";
    detail = running[0]?.stage ?? null;
  } else {
    const lastFinished = recent.find((j) => j.status === "failed" || j.status === "succeeded" || j.status === "canceled");
    const sources = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.role, "source")));
    if (lastFinished?.status === "failed") {
      status = "error";
      error = lastFinished.errorMessage ?? "Erro no processamento.";
    } else if (!sources.length) {
      status = "draft";
    } else {
      const done = project.currentVersionId
        ? await db
            .select({ id: renders.id })
            .from(renders)
            .where(and(eq(renders.projectId, projectId), eq(renders.versionId, project.currentVersionId), eq(renders.kind, "export"), eq(renders.status, "succeeded")))
            .limit(1)
        : [];
      status = done.length ? "ready" : "editing";
    }
  }
  await setProjectStatus(db, projectId, status, detail, error);
  return status;
}

/** Cria renderizações (uma por formato) da versão atual e enfileira as tarefas. */
export async function queueRenders(
  db: Db,
  orgId: string,
  projectId: string,
  userId: string | null,
  presets: string[],
  resolution: string,
  kind: "export" | "preview" = "export",
): Promise<string[]> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project?.currentVersionId) return [];
  const settings = RenderSettingsSchema.parse({ resolution: ["720p", "1080p", "2160p"].includes(resolution) ? resolution : "1080p" });
  const ids: string[] = [];
  for (const preset of presets.filter((p): p is FormatPresetId => (FORMAT_PRESET_IDS as readonly string[]).includes(p))) {
    const [r] = await db
      .insert(renders)
      .values({ orgId, projectId, versionId: project.currentVersionId, kind, preset, settings, createdBy: userId })
      .returning();
    const job = await enqueueJob(db, { orgId, projectId, type: "render", payload: { renderId: r.id }, priority: kind === "preview" ? 40 : 60, maxAttempts: 2 });
    await db.update(renders).set({ jobId: job.id }).where(eq(renders.id, r.id));
    ids.push(r.id);
  }
  return ids;
}
