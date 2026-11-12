import { z } from "zod";
import { EditOperation } from "@vision/core";
import { getDb, aiCommands, enqueueJob } from "@vision/db";
import { assertWithinLimits, capabilities } from "@vision/server";
import { HttpError, api, json, readJson } from "@/lib/api";
import { getProjectForOrg } from "@/lib/projects";

const Body = z.object({
  text: z.string().trim().min(2).max(4000),
  /**
   * Operações já definidas pelos controles do estúdio (ex.: narração com voz escolhida).
   * Passam pelo worker por causa da geração de áudio, mas sem a IA reinterpretar o pedido.
   */
  operations: z.array(EditOperation).min(1).max(12).optional(),
});

/** Envia um comando em linguagem natural; o worker planeja e aplica a edição. */
export const POST = api(async (req, { session, params }) => {
  const p = await getProjectForOrg(params.id, session.org.id);
  if (!p.currentVersionId) throw new HttpError(409, "Aguarde o processamento dos vídeos antes de enviar comandos.");
  const { text, operations } = await readJson(req, Body);
  const db = getDb();
  if (capabilities().ai && !operations) await assertWithinLimits(db, p.orgId, "ai");
  const [cmd] = await db
    .insert(aiCommands)
    .values({
      orgId: p.orgId,
      projectId: p.id,
      userId: session.user.id,
      text,
      baseVersionId: p.currentVersionId,
      ...(operations ? { engine: "manual", plan: { reply: "", operations } } : {}),
    })
    .returning();
  const job = await enqueueJob(db, { orgId: p.orgId, projectId: p.id, type: "ai_command", payload: { commandId: cmd.id }, priority: 30, maxAttempts: 2 });
  return json({ commandId: cmd.id, jobId: job.id }, { status: 202 });
});
