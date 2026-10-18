import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Db, Job } from "@vision/db";
import { heartbeat } from "@vision/db";
import { getConfig, log } from "@vision/server";

export interface JobContext {
  db: Db;
  job: Job;
  workerId: string;
  signal: AbortSignal;
  tmpDir: string;
  log: ReturnType<typeof log.child>;
  /** Atualiza progresso (0..1) e etapa; gravação limitada a 1x/s. */
  progress(fraction: number, stage?: string): void;
}

export async function createContext(db: Db, job: Job, workerId: string) {
  const controller = new AbortController();
  const tmpDir = path.resolve(getConfig().WORKER_TMP_DIR, job.id);
  await mkdir(tmpDir, { recursive: true });
  let pending: { progress?: number; stage?: string } = {};
  let lastWrite = 0;
  let flushing: Promise<void> | null = null;

  const flush = async () => {
    const update = pending;
    pending = {};
    lastWrite = Date.now();
    const hb = await heartbeat(db, job.id, workerId, update).catch(() => ({ cancelRequested: false, lost: false }));
    if (hb.cancelRequested && !controller.signal.aborted) controller.abort();
  };

  const timer = setInterval(() => {
    if (!flushing) flushing = flush().finally(() => (flushing = null));
  }, 5_000);

  const ctx: JobContext = {
    db,
    job,
    workerId,
    signal: controller.signal,
    tmpDir,
    log: log.child({ jobId: job.id, type: job.type, projectId: job.projectId }),
    progress(fraction, stage) {
      pending.progress = fraction;
      if (stage !== undefined) pending.stage = stage;
      if (Date.now() - lastWrite > 1_000 && !flushing) flushing = flush().finally(() => (flushing = null));
    },
  };
  const dispose = async () => {
    clearInterval(timer);
    if (flushing) await flushing;
    await rm(tmpDir, { recursive: true, force: true });
  };
  return { ctx, dispose };
}
