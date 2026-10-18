import {
  and,
  eq,
  inArray,
  type AutopilotConfig,
  type Db,
  aiCommands,
  assets,
  enqueueJob,
  jobs,
  projects,
  transcripts,
} from "@vision/db";
import { ACTIVE, capabilities, queueRenders } from "@vision/server";

/** Avança o modo "Criar vídeo com IA" depois de cada etapa concluída. */
export async function continueAutopilot(db: Db, projectId: string): Promise<void> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const ap = project?.autopilot;
  if (!project || !ap || ap.stage === "done" || ap.stage === "failed") return;
  const pending = await db
    .select({ id: jobs.id, type: jobs.type })
    .from(jobs)
    .where(and(eq(jobs.projectId, projectId), inArray(jobs.status, ACTIVE)));

  if (ap.stage === "waiting_analysis") {
    if (pending.some((j) => ["probe", "analyze", "transcribe"].includes(j.type))) return;
    const sources = await db.select().from(assets).where(and(eq(assets.projectId, projectId), eq(assets.role, "source")));
    if (!sources.length || sources.some((s) => s.status !== "ready" && s.status !== "error")) return;
    if (!project.currentVersionId) return;
    // transcreve antes do planejamento quando o serviço existe (melhora seleção e legendas)
    if (capabilities().transcription) {
      const have = await db.select({ assetId: transcripts.assetId }).from(transcripts).where(inArray(transcripts.assetId, sources.map((s) => s.id)));
      const missing = sources.filter((s) => s.status === "ready" && s.hasAudio && !have.some((h) => h.assetId === s.id));
      const triedAlready = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.projectId, projectId), eq(jobs.type, "transcribe")))
        .limit(1);
      if (missing.length && !triedAlready.length) {
        for (const s of missing) {
          await enqueueJob(db, { orgId: project.orgId, projectId, assetId: s.id, type: "transcribe", payload: { autopilot: true } });
        }
        return;
      }
    }
    const [cmd] = await db
      .insert(aiCommands)
      .values({ orgId: project.orgId, projectId, userId: project.createdBy, text: ap.command, baseVersionId: project.currentVersionId })
      .returning();
    await enqueueJob(db, { orgId: project.orgId, projectId, type: "ai_command", payload: { commandId: cmd.id, autopilot: true }, priority: 50 });
    await saveAutopilot(db, projectId, { ...ap, stage: "planning", commandId: cmd.id });
    return;
  }

  if (ap.stage === "planning") {
    if (pending.some((j) => j.type === "ai_command")) return;
    if (!ap.autoRender) {
      await saveAutopilot(db, projectId, { ...ap, stage: "done" });
      return;
    }
    await queueRenders(db, project.orgId, projectId, project.createdBy, ap.presets, ap.resolution);
    await saveAutopilot(db, projectId, { ...ap, stage: "rendering" });
    return;
  }

  if (ap.stage === "rendering" && !pending.some((j) => j.type === "render")) {
    await saveAutopilot(db, projectId, { ...ap, stage: "done" });
  }
}

async function saveAutopilot(db: Db, projectId: string, ap: AutopilotConfig) {
  await db.update(projects).set({ autopilot: ap }).where(eq(projects.id, projectId));
}

