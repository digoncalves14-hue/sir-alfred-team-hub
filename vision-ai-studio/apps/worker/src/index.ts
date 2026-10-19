import { readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { claimJob, closeDb, getDb, recoverStaleJobs } from "@vision/db";
import { getConfig, log } from "@vision/server";
import { runJob } from "./runner";

/**
 * Worker de processamento audiovisual. Roda separado da aplicação web
 * (contêiner próprio), sem limite curto de execução, com concorrência configurável.
 */
const cfg = getConfig();
const db = getDb();
const workerId = `${os.hostname()}-${process.pid}`;
const running = new Set<Promise<void>>();
let stopping = false;

async function loop(slot: number): Promise<void> {
  while (!stopping) {
    try {
      const job = await claimJob(db, workerId);
      if (!job) {
        await sleep(1000 + slot * 100);
        continue;
      }
      const p = runJob(db, job, workerId);
      running.add(p);
      await p.finally(() => running.delete(p));
    } catch (err) {
      log.error("worker_loop_error", { err });
      await sleep(3000);
    }
  }
}

async function housekeeping(): Promise<void> {
  try {
    const n = await recoverStaleJobs(db, cfg.JOB_STALE_SECONDS);
    if (n) log.warn("stale_jobs_recovered", { count: n });
    // remove diretórios temporários órfãos (> 6h)
    const dir = path.resolve(cfg.WORKER_TMP_DIR);
    for (const name of await readdir(dir).catch(() => [])) {
      const p = path.join(dir, name);
      const s = await stat(p).catch(() => null);
      if (s && Date.now() - s.mtimeMs > 6 * 3600_000) await rm(p, { recursive: true, force: true });
    }
  } catch (err) {
    log.error("housekeeping_failed", { err });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("worker_stopping", { signal, running: running.size });
  const timeout = sleep(30_000);
  await Promise.race([Promise.allSettled([...running]), timeout]);
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log.info("worker_started", {
  workerId,
  concurrency: cfg.WORKER_CONCURRENCY,
  storage: cfg.STORAGE_DRIVER,
  ai: cfg.aiProvider,
  transcription: cfg.transcriptionProvider,
});
await housekeeping();
setInterval(() => void housekeeping(), 30_000).unref();
await Promise.all(Array.from({ length: cfg.WORKER_CONCURRENCY }, (_, i) => loop(i)));
