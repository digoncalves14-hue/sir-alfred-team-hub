import { and, eq, sql } from "drizzle-orm";
import type { JobType } from "@vision/core";
import type { Db } from "./client";
import { type Job, jobs } from "./schema";

/**
 * Fila de tarefas sobre o PostgreSQL (SELECT ... FOR UPDATE SKIP LOCKED).
 * Vantagens no MVP: transacional com o resto dos dados, sem infraestrutura
 * extra, com retentativas, cancelamento e recuperação de workers que caíram.
 * A interface é pequena para permitir trocar por SQS/Redis no futuro.
 */

export interface EnqueueInput {
  orgId: string;
  projectId?: string | null;
  assetId?: string | null;
  type: JobType;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  delayMs?: number;
}

export async function enqueueJob(db: Db, input: EnqueueInput): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      assetId: input.assetId ?? null,
      type: input.type,
      payload: input.payload ?? {},
      priority: input.priority ?? 100,
      maxAttempts: input.maxAttempts ?? 3,
      runAfter: new Date(Date.now() + (input.delayMs ?? 0)),
    })
    .returning();
  return job;
}

/** Reserva atomicamente a próxima tarefa disponível. */
export async function claimJob(db: Db, workerId: string, types?: readonly string[]): Promise<Job | null> {
  const typeFilter = types?.length ? sql`AND type IN (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``;
  const res = await db.execute(sql`
    UPDATE jobs SET
      status = 'running',
      locked_by = ${workerId},
      locked_at = now(),
      heartbeat_at = now(),
      started_at = COALESCE(started_at, now()),
      attempts = attempts + 1,
      stage = NULL
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_after <= now() AND cancel_requested = false ${typeFilter}
      ORDER BY priority ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  const row = res.rows[0] as { id: string } | undefined;
  if (!row) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, row.id));
  return job ?? null;
}

/** Atualiza progresso e batimento; devolve true se o cancelamento foi solicitado. */
export async function heartbeat(
  db: Db,
  jobId: string,
  workerId: string,
  update: { progress?: number; stage?: string } = {},
): Promise<{ cancelRequested: boolean; lost: boolean }> {
  const set: Record<string, unknown> = { heartbeatAt: new Date() };
  if (update.progress !== undefined) set.progress = Math.max(0, Math.min(1, update.progress));
  if (update.stage !== undefined) set.stage = update.stage;
  const rows = await db
    .update(jobs)
    .set(set)
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, "running")))
    .returning({ cancelRequested: jobs.cancelRequested });
  if (!rows.length) return { cancelRequested: true, lost: true };
  return { cancelRequested: rows[0].cancelRequested, lost: false };
}

export async function completeJob(db: Db, job: Job, result: Record<string, unknown> = {}): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "succeeded",
      progress: 1,
      result,
      finishedAt: new Date(),
      lockedBy: null,
      processingMs: job.startedAt ? Date.now() - new Date(job.startedAt).getTime() : null,
    })
    .where(eq(jobs.id, job.id));
}

/**
 * Registra falha. Se for recuperável e houver tentativas restantes, reagenda
 * com espera exponencial; caso contrário marca como falha definitiva.
 * Devolve true quando a falha é definitiva.
 */
export async function failJob(
  db: Db,
  job: Job,
  err: { code: string; message: string; retryable: boolean },
): Promise<boolean> {
  const final = !err.retryable || job.attempts >= job.maxAttempts;
  if (final) {
    await db
      .update(jobs)
      .set({
        status: "failed",
        errorCode: err.code,
        errorMessage: err.message.slice(0, 2000),
        finishedAt: new Date(),
        lockedBy: null,
      })
      .where(eq(jobs.id, job.id));
    return true;
  }
  const backoffMs = Math.min(5 * 60_000, 5_000 * 2 ** (job.attempts - 1));
  await db
    .update(jobs)
    .set({
      status: "queued",
      errorCode: err.code,
      errorMessage: err.message.slice(0, 2000),
      runAfter: new Date(Date.now() + backoffMs),
      lockedBy: null,
      progress: 0,
    })
    .where(eq(jobs.id, job.id));
  return false;
}

export async function markCanceled(db: Db, jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "canceled", finishedAt: new Date(), lockedBy: null, errorCode: "canceled", errorMessage: "Cancelado pelo usuário." })
    .where(eq(jobs.id, jobId));
}

/** Pede cancelamento. Tarefas ainda na fila são canceladas imediatamente. */
export async function requestCancel(db: Db, jobId: string, orgId: string): Promise<Job | null> {
  const [job] = await db
    .update(jobs)
    .set({ cancelRequested: true })
    .where(and(eq(jobs.id, jobId), eq(jobs.orgId, orgId)))
    .returning();
  if (!job) return null;
  if (job.status === "queued") await markCanceled(db, job.id);
  return job;
}

/**
 * Recupera tarefas de workers que pararam de responder (sem batimento por
 * `staleSeconds`): volta para a fila ou falha se esgotou as tentativas.
 */
export async function recoverStaleJobs(db: Db, staleSeconds = 120): Promise<number> {
  const res = await db.execute(sql`
    UPDATE jobs SET
      status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
      error_code = 'worker_lost',
      error_message = 'O processamento foi interrompido (worker parou de responder).',
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
      locked_by = NULL,
      run_after = now() + interval '5 seconds'
    WHERE status = 'running' AND heartbeat_at < now() - make_interval(secs => ${staleSeconds})
    RETURNING id
  `);
  return res.rows.length;
}
