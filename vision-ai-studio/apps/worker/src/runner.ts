import type { JobType } from "@vision/core";
import { eq, type Db, type Job, aiCommands, assets, completeJob, failJob, markCanceled, renders } from "@vision/db";
import { CanceledError, log, refreshProjectStatus, toProcessingError } from "@vision/server";
import { createContext, type JobContext } from "./context";
import { handleAiCommand } from "./handlers/ai-command";
import { handleAnalyze } from "./handlers/analyze";
import { handleProbe } from "./handlers/probe";
import { handleRender } from "./handlers/render";
import { handleTranscribe } from "./handlers/transcribe";
import { continueAutopilot } from "./pipeline";

const HANDLERS: Partial<Record<JobType, (ctx: JobContext) => Promise<Record<string, unknown>>>> = {
  probe: handleProbe,
  analyze: handleAnalyze,
  transcribe: handleTranscribe,
  ai_command: handleAiCommand,
  render: handleRender,
};

/** Executa uma tarefa já reservada, tratando sucesso, falha, retentativa e cancelamento. */
export async function runJob(db: Db, job: Job, workerId: string): Promise<void> {
  const handler = HANDLERS[job.type as JobType];
  const { ctx, dispose } = await createContext(db, job, workerId);
  const started = Date.now();
  ctx.log.info("job_started", { attempt: job.attempts });
  if (job.projectId) await refreshProjectStatus(db, job.projectId).catch(() => {});
  try {
    if (!handler) throw new Error(`Tipo de tarefa desconhecido: ${job.type}`);
    const result = await handler(ctx);
    if (ctx.signal.aborted) throw new CanceledError();
    await completeJob(db, job, result);
    ctx.log.info("job_succeeded", { ms: Date.now() - started });
  } catch (err) {
    if (err instanceof CanceledError || ctx.signal.aborted) {
      await markCanceled(db, job.id);
      await onFinalFailure(db, job, "Cancelado pelo usuário.", true);
      ctx.log.info("job_canceled", { ms: Date.now() - started });
    } else {
      const pe = toProcessingError(err);
      const final = await failJob(db, job, { code: pe.code, message: pe.userMessage, retryable: pe.retryable });
      ctx.log.error("job_failed", { code: pe.code, final, detail: pe.detail?.slice(-1500), err: pe.code === "internal" ? (err as Error) : undefined });
      if (final) await onFinalFailure(db, job, pe.userMessage, false);
    }
  } finally {
    await dispose();
    if (job.projectId) {
      await continueAutopilot(db, job.projectId).catch((e) => log.error("autopilot_failed", { err: e, projectId: job.projectId }));
      await refreshProjectStatus(db, job.projectId).catch(() => {});
    }
  }
}

/** Reflete a falha definitiva nas entidades afetadas, sem apagar nada do projeto. */
async function onFinalFailure(db: Db, job: Job, message: string, canceled: boolean): Promise<void> {
  const status = canceled ? "canceled" : "failed";
  if (job.type === "render" && job.payload.renderId) {
    await db.update(renders).set({ status, errorMessage: message, finishedAt: new Date() }).where(eq(renders.id, String(job.payload.renderId)));
  }
  if (job.type === "ai_command" && job.payload.commandId) {
    await db.update(aiCommands).set({ status: "failed", errorMessage: message, finishedAt: new Date() }).where(eq(aiCommands.id, String(job.payload.commandId)));
  }
  if ((job.type === "probe" || job.type === "analyze") && job.assetId) {
    await db.update(assets).set({ status: "error", errorMessage: message, updatedAt: new Date() }).where(eq(assets.id, job.assetId));
  }
}
