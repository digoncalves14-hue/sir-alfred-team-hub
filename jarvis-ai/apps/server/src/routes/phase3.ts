/**
 * Rotas da Fase 3 (iOS):
 *  - Tokens de aparelho para Siri/Atalhos em segundo plano (criar, listar, revogar).
 *  - Relato de ações executadas no iPhone.
 *  - /v1/intents/*: endpoints mínimos usados pelos App Intents SEM abrir o app.
 *    Autenticação por token de aparelho (escopo restrito, revogável), nunca a sessão completa.
 */
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { DeviceActionReportSchema, IntentMemoryRequestSchema, IntentTaskRequestSchema } from "@jarvis/shared";
import { AppError, notFound } from "../errors";
import type { Orchestrator } from "../agent/orchestrator";
import { buildDay, summaryText } from "../agent/summary";
import { addDays, humanDateTime, localDate, localToUtc } from "../agent/time";
import type { GoogleGateway } from "../google/gateway";
import { IntegrationError } from "../google/errors";
import { detectSensitive } from "../security/sensitive";
import type { SystemStore } from "../store/types";

export interface Phase3Deps {
  system: SystemStore | null;
  google: GoogleGateway | null;
}

const IdParams = z.object({ id: z.string().uuid() });
export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Rotas autenticadas pela sessão do usuário (dentro de /v1). */
export async function registerPhase3UserRoutes(v1: FastifyInstance, deps: Phase3Deps & { orchestrator: Orchestrator }) {
  v1.post("/device-tokens", async (req, reply) => {
    if (!deps.system) throw new AppError("atalhos_nao_configurados", 503, "Atalhos em segundo plano exigem SUPABASE_SERVICE_ROLE_KEY no servidor.");
    const { name } = z.object({ name: z.string().trim().min(1).max(100).default("iPhone") }).parse(req.body ?? {});
    const token = `jdt_${randomBytes(32).toString("base64url")}`;
    const id = await deps.system.createDeviceToken(req.store.userId, hashDeviceToken(token), name);
    await req.store.logAction({ tool: "app:ativar_atalhos", status: "executed", summary: `Atalhos da Siri ativados em "${name}"` });
    // O token em claro é devolvido UMA vez; o app o guarda no Keychain.
    return reply.status(201).send({ id, token });
  });

  v1.get("/device-tokens", async (req) => ({ tokens: await req.store.listDeviceTokens() }));

  v1.delete("/device-tokens/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.revokeDeviceToken(id))) throw notFound("Aparelho");
    await req.store.logAction({ tool: "app:revogar_atalhos", status: "executed", summary: "Acesso dos Atalhos/Siri revogado" });
    return reply.status(204).send();
  });

  v1.post("/actions/:id/report", async (req) => {
    const { id } = IdParams.parse(req.params);
    const report = DeviceActionReportSchema.parse(req.body);
    const r = await deps.orchestrator.reportDeviceAction(req.store, id, report);
    return { action: { id: r.action.id, tool: r.action.tool, summary: r.action.summary, status: r.action.status, createdAt: r.action.createdAt, expiresAt: r.action.expiresAt, executor: r.action.executor }, message: r.message };
  });
}

declare module "fastify" {
  interface FastifyRequest {
    deviceUserId: string;
  }
}

/** Rotas dos App Intents (fora do escopo da sessão; autenticação por token de aparelho). */
export async function registerIntentRoutes(app: FastifyInstance, deps: Phase3Deps) {
  await app.register(
    async (intents) => {
      intents.addHook("onRequest", async (req: FastifyRequest) => {
        if (!deps.system) throw new AppError("atalhos_nao_configurados", 503, "Atalhos em segundo plano não configurados no servidor.");
        const header = req.headers.authorization ?? "";
        const token = header.startsWith("Device ") ? header.slice(7).trim() : "";
        if (!/^jdt_[A-Za-z0-9_-]{20,}$/.test(token)) throw new AppError("nao_autenticado", 401, "Ative os atalhos novamente no app JARVIS.");
        const userId = await deps.system.resolveDeviceToken(hashDeviceToken(token));
        if (!userId) throw new AppError("nao_autenticado", 401, "Este iPhone não está mais autorizado. Ative os atalhos novamente no app JARVIS.");
        req.deviceUserId = userId;
      });

      const system = () => deps.system!;

      intents.get("/summary", async (req) => {
        const userId = req.deviceUserId;
        const profile = await system().getProfileFor(userId);
        const date = localDate(new Date(), profile.timezone);
        const tasks = await system().openTasksForUser(userId, date);
        const day = await buildDay(deps.google?.forUser(userId) ?? null, tasks, date, profile.timezone);
        await system().logActionFor(userId, { tool: "siri:resumo_do_dia", status: "executed", summary: "Resumo do dia pela Siri" });
        return { speech: summaryText(day, profile.ownerName, profile.timezone, "Certo") };
      });

      intents.get("/agenda", async (req) => {
        const { dia } = z.object({ dia: z.enum(["hoje", "amanha"]).default("hoje") }).parse(req.query);
        const userId = req.deviceUserId;
        const profile = await system().getProfileFor(userId);
        const tz = profile.timezone;
        const today = localDate(new Date(), tz);
        const date = dia === "hoje" ? today : addDays(today, 1);
        const label = dia === "hoje" ? "Hoje" : "Amanhã";
        const google = deps.google?.forUser(userId) ?? null;
        if (!google || !(await google.connected("calendar"))) {
          return { speech: "O Google Agenda não está conectado ao Jarvis. Conecte em Ajustes, Integrações, no app." };
        }
        try {
          const events = await (await google.calendar()).list(localToUtc(date, tz), localToUtc(addDays(date, 1), tz), tz, 20);
          await system().logActionFor(userId, { tool: "siri:consultar_agenda", status: "executed", summary: `Agenda de ${date} pela Siri` });
          if (events.length === 0) return { speech: `${label} você não tem compromissos na agenda.` };
          const items = events
            .slice(0, 6)
            .map((e) => (e.allDay ? `${e.title}, o dia todo` : `${humanDateTime(e.startAt, tz, false)}, ${e.title}`))
            .join("; ");
          const more = events.length > 6 ? ` E mais ${events.length - 6}.` : "";
          return { speech: `${label} você tem ${events.length} compromisso${events.length > 1 ? "s" : ""}: ${items}.${more}` };
        } catch (e) {
          return { speech: e instanceof IntegrationError ? e.message : "Não consegui consultar a agenda agora." };
        }
      });

      intents.post("/tasks", async (req, reply) => {
        const { titulo } = IntentTaskRequestSchema.parse(req.body);
        const task = await system().createTaskFor(req.deviceUserId, { title: titulo, space: "pessoal", priority: "normal" });
        await system().logActionFor(req.deviceUserId, { tool: "siri:registrar_tarefa", status: "executed", summary: `Tarefa pela Siri: "${task.title}"` });
        return reply.status(201).send({ speech: `Tarefa registrada: ${task.title}.` });
      });

      intents.post("/memory", async (req, reply) => {
        const { texto } = IntentMemoryRequestSchema.parse(req.body);
        const userId = req.deviceUserId;
        const profile = await system().getProfileFor(userId);
        if (!profile.memoryEnabled) return reply.status(200).send({ speech: "O armazenamento de memória está desativado. Nada foi salvo." });
        const sensitive = detectSensitive(texto);
        if (sensitive) {
          await system().logActionFor(userId, { tool: "siri:salvar_memoria", status: "blocked", summary: `Bloqueado: possível ${sensitive}` });
          return reply.status(200).send({ speech: `Por segurança, não guardo ${sensitive}. Nada foi salvo.` });
        }
        await system().createMemoryFor(userId, { category: "outro", space: "pessoal", content: texto });
        await system().logActionFor(userId, { tool: "siri:salvar_memoria", status: "executed", summary: "Memória salva pelos Atalhos" });
        return reply.status(201).send({ speech: "Guardado na memória do Jarvis." });
      });
    },
    { prefix: "/v1/intents" },
  );
}
