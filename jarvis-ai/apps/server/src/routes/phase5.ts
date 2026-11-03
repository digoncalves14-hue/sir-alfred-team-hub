/** Rotas da Fase 5: rotinas, confirmação em lote (múltiplas etapas) e reindexação da memória. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BatchConfirmRequestSchema, RoutineCreateSchema, RoutineUpdateSchema } from "@jarvis/shared";
import { AppError, notFound } from "../errors";
import { normalizeLoose, type Orchestrator } from "../agent/orchestrator";
import type { MemoryIndex } from "../memory/index";

const IdParams = z.object({ id: z.string().uuid() });

export async function registerPhase5Routes(v1: FastifyInstance, deps: { orchestrator: Orchestrator; memory: MemoryIndex | null }) {
  // ---- Rotinas ----
  v1.get("/routines", async (req) => ({ routines: await req.store.listRoutines() }));

  v1.post("/routines", async (req, reply) => {
    const body = RoutineCreateSchema.parse(req.body);
    if (body.scheduleEnabled && !body.runTime) throw new AppError("entrada_invalida", 400, "Para agendar, informe o horário.");
    const existing = await req.store.listRoutines();
    if (existing.some((r) => normalizeLoose(r.triggerPhrase) === normalizeLoose(body.triggerPhrase))) {
      throw new AppError("frase_repetida", 409, "Já existe uma rotina com essa frase de ativação.");
    }
    const routine = await req.store.createRoutine(body);
    await req.store.logAction({ tool: "app:criar_rotina", status: "executed", summary: `Rotina criada: ${routine.name}` });
    return reply.status(201).send({ routine });
  });

  v1.patch("/routines/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const patch = RoutineUpdateSchema.parse(req.body);
    const routine = await req.store.updateRoutine(id, patch);
    if (!routine) throw notFound("Rotina");
    if (routine.scheduleEnabled && !routine.runTime) throw new AppError("entrada_invalida", 400, "Para agendar, informe o horário.");
    return { routine };
  });

  v1.delete("/routines/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.deleteRoutine(id))) throw notFound("Rotina");
    return reply.status(204).send();
  });

  // ---- Múltiplas etapas: confirmar várias ações de uma vez ----
  v1.post("/actions/confirm-batch", async (req) => {
    const { ids } = BatchConfirmRequestSchema.parse(req.body);
    return { results: await deps.orchestrator.confirmMany(req.store, ids) };
  });

  // ---- Memória semântica ----
  v1.post("/memories/reindex", async (req) => {
    if (!deps.memory?.semantic) throw new AppError("memoria_semantica_off", 503, "Memória semântica não configurada no servidor (VOYAGE_API_KEY).");
    return { indexed: await deps.memory.reindex(req.store) };
  });
}
