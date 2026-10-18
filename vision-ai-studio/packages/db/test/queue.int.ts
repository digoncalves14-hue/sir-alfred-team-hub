/**
 * Teste de integração da fila. ATENÇÃO: limpa tarefas pendentes — use um banco de
 * TESTE dedicado, com o worker parado. Só roda com VISION_TEST_DB=1 e DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/client";
import { migrate } from "../src/migrate";
import { claimJob, completeJob, enqueueJob, failJob, heartbeat, recoverStaleJobs, requestCancel } from "../src/queue";
import { jobs, organizations } from "../src/schema";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.VISION_TEST_DB === "1";
let orgId = "";

describe.skipIf(!hasDb)("fila de tarefas no PostgreSQL", () => {
  beforeAll(async () => {
    await migrate();
    const [org] = await getDb().insert(organizations).values({ name: "Fila", slug: `fila-${Date.now()}` }).returning();
    orgId = org.id;
    await getDb().execute(sql`DELETE FROM jobs WHERE status IN ('queued','running')`);
  });
  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
    await closeDb();
  });

  it("reserva tarefas sem duplicidade e respeita prioridade", async () => {
    const db = getDb();
    const low = await enqueueJob(db, { orgId, type: "render", priority: 100 });
    const high = await enqueueJob(db, { orgId, type: "probe", priority: 10 });
    const [a, b] = await Promise.all([claimJob(db, "w1"), claimJob(db, "w2")]);
    expect(new Set([a!.id, b!.id])).toEqual(new Set([low.id, high.id]));
    const first = [a!, b!].find((j) => j.id === high.id)!;
    expect(first.attempts).toBe(1);
    await completeJob(db, a!, { ok: true });
    await completeJob(db, b!, { ok: true });
    expect(await claimJob(db, "w3")).toBeNull();
  });

  it("falha recuperável volta para a fila; definitiva marca erro", async () => {
    const db = getDb();
    await enqueueJob(db, { orgId, type: "transcribe", maxAttempts: 2 });
    const j1 = await claimJob(db, "w1");
    expect(await failJob(db, j1!, { code: "network", message: "rede", retryable: true })).toBe(false);
    await db.execute(sql`UPDATE jobs SET run_after = now() WHERE id = ${j1!.id}`);
    const j2 = await claimJob(db, "w1");
    expect(j2!.attempts).toBe(2);
    expect(await failJob(db, j2!, { code: "network", message: "rede", retryable: true })).toBe(true);
    const [row] = await db.select().from(jobs).where(sql`id = ${j1!.id}`);
    expect(row.status).toBe("failed");
  });

  it("cancelamento: na fila cancela na hora; em execução sinaliza no batimento", async () => {
    const db = getDb();
    const q = await enqueueJob(db, { orgId, type: "render" });
    await requestCancel(db, q.id, orgId);
    const [row] = await db.select().from(jobs).where(sql`id = ${q.id}`);
    expect(row.status).toBe("canceled");
    await enqueueJob(db, { orgId, type: "render" });
    const r = await claimJob(db, "w1");
    await requestCancel(db, r!.id, orgId);
    expect((await heartbeat(db, r!.id, "w1", { progress: 0.5 })).cancelRequested).toBe(true);
    await completeJob(db, r!);
  });

  it("recupera tarefas de worker que parou de responder", async () => {
    const db = getDb();
    await enqueueJob(db, { orgId, type: "analyze" });
    const j = await claimJob(db, "morto");
    await db.execute(sql`UPDATE jobs SET heartbeat_at = now() - interval '10 minutes' WHERE id = ${j!.id}`);
    expect(await recoverStaleJobs(db, 60)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(jobs).where(sql`id = ${j!.id}`);
    expect(row.status).toBe("queued");
    expect(row.errorCode).toBe("worker_lost");
    await db.execute(sql`DELETE FROM jobs WHERE id = ${j!.id}`);
  });
});
