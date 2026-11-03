import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import {
  ChatRequestSchema,
  DeviceActionSchema,
  MemoryCategorySchema,
  MemoryCreateSchema,
  MemoryUpdateSchema,
  ProfileUpdateSchema,
  SpaceSchema,
  TtsRequestSchema,
  type Health,
  type UsageSummary,
} from "@jarvis/shared";
import { AppError, notFound } from "./errors";
import type { Authenticator } from "./auth";
import type { Orchestrator } from "./agent/orchestrator";
import { startOfDayInTimezone, isValidTimezone } from "./agent/time";
import type { AIProvider } from "./ai/types";
import type { TtsProvider } from "./tts/elevenlabs";
import type { UserStore } from "./store/types";
import { detectSensitive } from "./security/sensitive";
import { registerPhase2Routes, type Phase2Deps } from "./routes/phase2";
import { registerIntentRoutes, registerPhase3UserRoutes } from "./routes/phase3";
import type { Scheduler } from "./scheduler/scheduler";
import { timingSafeEqual } from "node:crypto";

export const VERSION = "0.3.0";

export interface AppDeps {
  authenticate: Authenticator;
  orchestrator: Orchestrator;
  provider: AIProvider;
  tts: TtsProvider;
  ttsCostPer1kChars: number;
  rateLimitPerMinute: number;
  logLevel?: string;
  logger?: boolean;
  phase2?: Phase2Deps;
  scheduler?: Scheduler | null;
  cronSecret?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    store: UserStore;
  }
}

const IdParams = z.object({ id: z.string().uuid() });

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: deps.logLevel ?? "info",
            // Nunca registrar tokens; conteúdo de conversas não é logado.
            redact: ["req.headers.authorization", "req.headers.cookie"],
          },
    bodyLimit: 64 * 1024,
  });

  await app.register(rateLimit, {
    max: deps.rateLimitPerMinute,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers.authorization ? `t:${req.headers.authorization.slice(-24)}` : `ip:${req.ip}`),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");
      return reply.status(400).send({ error: { code: "entrada_invalida", message } });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 429) {
      return reply.status(429).send({ error: { code: "muitas_requisicoes", message: "Muitas requisições. Aguarde um instante." } });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: "requisicao_invalida", message: e.message ?? "Requisição inválida." } });
    }
    req.log.error({ err }, "erro interno");
    return reply.status(500).send({ error: { code: "erro_interno", message: "Erro interno no servidor. Tente novamente." } });
  });

  // Autenticação obrigatória em /v1/*
  const authenticate = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new AppError("nao_autenticado", 401, "Faça login para continuar.");
    req.store = await deps.authenticate(token);
  };

  app.get("/health", async (): Promise<Health> => ({
    ok: true,
    version: VERSION,
    ai: { provider: deps.provider.name, model: deps.provider.model, configured: deps.provider.configured },
    tts: { provider: deps.tts.name, configured: deps.tts.configured },
    google: { configured: Boolean(deps.phase2?.google && deps.phase2.system && deps.phase2.box) },
    push: { configured: Boolean(deps.phase2?.system) },
    scheduler: { running: deps.scheduler?.active ?? false, cron: Boolean(deps.scheduler && deps.cronSecret) },
  }));

  // Cron externo (ex.: cron-job.org, GitHub Actions) para hospedagens que "dormem".
  app.post("/internal/cron/tick", async (req, reply) => {
    const given = Buffer.from(String(req.headers["x-cron-secret"] ?? ""));
    const expected = Buffer.from(deps.cronSecret ?? "");
    if (!deps.cronSecret || !deps.scheduler || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.status(404).send({ error: { code: "nao_encontrado", message: "Não encontrado." } });
    }
    return deps.scheduler.tick();
  });

  await app.register(async (v1) => {
    v1.addHook("onRequest", authenticate);

    // ---- Perfil ----
    v1.get("/me", async (req) => ({ userId: req.store.userId, profile: await req.store.getProfile() }));
    v1.patch("/settings", async (req) => {
      const patch = ProfileUpdateSchema.parse(req.body);
      if (patch.timezone && !isValidTimezone(patch.timezone)) throw new AppError("entrada_invalida", 400, "Fuso horário inválido.");
      return { profile: await req.store.updateProfile(patch) };
    });

    // ---- Conversa ----
    v1.post("/chat", async (req) => {
      const body = ChatRequestSchema.parse(req.body);
      return deps.orchestrator.runTurn(req.store, body);
    });
    v1.get("/conversations", async (req) => ({ conversations: await req.store.listConversations(50) }));
    v1.get("/conversations/:id/messages", async (req) => {
      const { id } = IdParams.parse(req.params);
      const conversation = await req.store.getConversation(id);
      if (!conversation) throw notFound("Conversa");
      return { conversation, messages: await req.store.listMessages(id, 200) };
    });
    v1.delete("/conversations/:id", async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      if (!(await req.store.deleteConversation(id))) throw notFound("Conversa");
      return reply.status(204).send();
    });

    // ---- Memória ----
    v1.get("/memories", async (req) => {
      const q = z
        .object({ q: z.string().max(200).optional(), category: MemoryCategorySchema.optional(), space: SpaceSchema.optional() })
        .parse(req.query);
      return { memories: await req.store.listMemories({ query: q.q, category: q.category, space: q.space, limit: 200 }) };
    });
    v1.post("/memories", async (req, reply) => {
      const body = MemoryCreateSchema.parse(req.body);
      const sensitive = detectSensitive(body.content);
      if (sensitive) throw new AppError("dado_sensivel", 422, `Por segurança, não armazenamos ${sensitive}.`);
      const memory = await req.store.createMemory({ ...body, source: "user" });
      return reply.status(201).send({ memory });
    });
    v1.patch("/memories/:id", async (req) => {
      const { id } = IdParams.parse(req.params);
      const patch = MemoryUpdateSchema.parse(req.body);
      if (patch.content) {
        const sensitive = detectSensitive(patch.content);
        if (sensitive) throw new AppError("dado_sensivel", 422, `Por segurança, não armazenamos ${sensitive}.`);
      }
      const memory = await req.store.updateMemory(id, patch);
      if (!memory) throw notFound("Memória");
      await req.store.logAction({ tool: "app:corrigir_memoria", status: "executed", summary: "Memória corrigida pelo usuário" });
      return { memory };
    });
    // Exclusão feita pelo próprio usuário na tela de Memória (a confirmação acontece no app).
    v1.delete("/memories/:id", async (req, reply) => {
      const { id } = IdParams.parse(req.params);
      if (!(await req.store.deleteMemory(id))) throw notFound("Memória");
      await req.store.logAction({ tool: "app:apagar_memoria", status: "executed", summary: "Memória apagada pelo usuário" });
      return reply.status(204).send();
    });

    // ---- Exportação de dados ----
    v1.get("/export", async (req, reply) => {
      const store = req.store;
      const [profile, memories, conversations, audit] = await Promise.all([
        store.getProfile(),
        store.listMemories({ limit: 5000 }),
        store.listConversations(200),
        store.listAudit(500),
      ]);
      const withMessages = [];
      for (const c of conversations) withMessages.push({ ...c, messages: await store.listMessages(c.id, 1000) });
      void reply.header("content-disposition", 'attachment; filename="jarvis-export.json"');
      return { exportedAt: new Date().toISOString(), profile, memories, conversations: withMessages, audit };
    });

    // ---- Ações pendentes ----
    v1.get("/actions/pending", async (req) => ({ actions: (await req.store.listPendingActions()).map(publicAction) }));
    v1.post("/actions/:id/confirm", async (req) => {
      const { id } = IdParams.parse(req.params);
      const r = await deps.orchestrator.confirmAction(req.store, id);
      return { action: publicAction(r.action), message: r.message };
    });
    v1.post("/actions/:id/reject", async (req) => {
      const { id } = IdParams.parse(req.params);
      const r = await deps.orchestrator.rejectAction(req.store, id);
      return { action: publicAction(r.action), message: r.message };
    });

    // ---- Auditoria e consumo ----
    v1.get("/audit", async (req) => ({ entries: await req.store.listAudit(100) }));
    v1.get("/usage", async (req): Promise<UsageSummary> => {
      const profile = await req.store.getProfile();
      const now = new Date();
      const [today, month] = await Promise.all([
        req.store.usageSince(startOfDayInTimezone(now, profile.timezone)),
        req.store.usageSince(new Date(now.getTime() - 30 * 86_400_000)),
      ]);
      return {
        today,
        last30Days: { costUsd: month.costUsd, requests: month.requests },
        dailyLimitUsd: profile.dailyCostLimitUsd,
        model: deps.provider.model,
      };
    });

    // ---- Voz premium (opcional) ----
    v1.post("/tts", async (req, reply: FastifyReply) => {
      if (!deps.tts.configured) throw new AppError("tts_nao_configurado", 503, "Voz premium não configurada; usando a voz do iPhone.");
      const { text } = TtsRequestSchema.parse(req.body);
      await deps.orchestrator.assertWithinBudget(req.store, await req.store.getProfile());
      const { audio, contentType } = await deps.tts.synthesize(text);
      await req.store.recordUsage({
        kind: "tts",
        provider: deps.tts.name,
        model: deps.tts.model,
        characters: text.length,
        costUsd: (text.length / 1000) * deps.ttsCostPer1kChars,
      });
      return reply.header("content-type", contentType).header("cache-control", "no-store").send(audio);
    });

    await registerPhase2Routes(v1, deps.phase2 ?? { system: null, google: null, box: null });
    await registerPhase3UserRoutes(v1, { system: deps.phase2?.system ?? null, google: deps.phase2?.google ?? null, orchestrator: deps.orchestrator });
  }, { prefix: "/v1" });

  await registerIntentRoutes(app, { system: deps.phase2?.system ?? null, google: deps.phase2?.google ?? null });

  return app;
}

function publicAction(a: { id: string; tool: string; summary: string; status: string; createdAt: string; expiresAt: string; executor?: string; input?: unknown }) {
  const executor = a.executor === "device" ? "device" : "server";
  // Para ações no iPhone, o app recebe a ação validada que deve executar localmente.
  const device = executor === "device" ? DeviceActionSchema.safeParse(a.input) : null;
  return {
    id: a.id,
    tool: a.tool,
    summary: a.summary,
    status: a.status,
    createdAt: a.createdAt,
    expiresAt: a.expiresAt,
    executor,
    ...(device?.success ? { device: device.data } : {}),
  };
}
