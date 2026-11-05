import { registerWebApp, type WebAppOptions } from "./web/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z, ZodError } from "zod";
import {
  ChatRequestSchema,
  type StreamEvent,
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
import { startOfDayInTimezone, isValidTimezone, localDate } from "./agent/time";
import { startOfMonthInTimezone } from "./agent/orchestrator";
import type { MemoryIndex } from "./memory/index";
import { registerPhase5Routes } from "./routes/phase5";
import type { AIProvider } from "./ai/types";
import type { TtsProvider } from "./tts/elevenlabs";
import type { UserStore } from "./store/types";
import { detectSensitive } from "./security/sensitive";
import { registerPhase2Routes, type Phase2Deps } from "./routes/phase2";
import { registerIntentRoutes, registerPhase3UserRoutes } from "./routes/phase3";
import { registerPhase4Routes, type Phase4Deps } from "./routes/phase4";
import type { Scheduler } from "./scheduler/scheduler";
import { timingSafeEqual } from "node:crypto";

export const VERSION = "0.5.0";

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
  phase4?: Phase4Deps;
  memory?: MemoryIndex | null;
  economyModel?: string | null;
  scheduler?: Scheduler | null;
  cronSecret?: string;
  /** Atrás de um proxy confiável (Render, Fly): usa o IP real do X-Forwarded-For. */
  trustProxy?: boolean;
  /** Versão web do app (pasta exportada + configuração pública do Supabase). */
  web?: WebAppOptions | null;
}

declare module "fastify" {
  interface FastifyRequest {
    store: UserStore;
  }
}

const IdParams = z.object({ id: z.string().uuid() });

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    trustProxy: deps.trustProxy ?? false,
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
    business: { connectors: Boolean(deps.phase4?.connectors), hub: Boolean(deps.phase4?.connectors?.hub), sheets: Boolean(deps.phase4?.connectors?.google) },
    memory: { semantic: Boolean(deps.memory?.semantic) },
    streaming: true,
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

    // Fase 5: resposta em streaming (Server-Sent Events) — o app começa a falar na 1ª frase.
    v1.post("/chat/stream", async (req, reply) => {
      const body = ChatRequestSchema.parse(req.body);
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      const send = (event: StreamEvent) => raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      try {
        const response = await deps.orchestrator.runTurn(req.store, body, {
          onText: (text) => send({ type: "delta", text }),
          onTool: (event) => send({ type: "tool", event }),
        });
        send({ type: "done", response });
      } catch (err) {
        const status = err instanceof AppError ? err.statusCode : 500;
        if (!(err instanceof AppError)) req.log.error({ err }, "erro no streaming");
        send({
          type: "error",
          code: err instanceof AppError ? err.code : "erro_interno",
          message: err instanceof AppError ? err.message : "Erro interno no servidor. Tente novamente.",
          status,
        });
      } finally {
        raw.end();
      }
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
      await deps.memory?.index(req.store, memory);
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
      if (patch.content) await deps.memory?.index(req.store, memory);
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
      const since30 = new Date(now.getTime() - 30 * 86_400_000);
      const monthStart = startOfMonthInTimezone(now, profile.timezone);
      const [today, last30, rows] = await Promise.all([
        req.store.usageSince(startOfDayInTimezone(now, profile.timezone)),
        req.store.usageSince(since30),
        req.store.usageRows(monthStart < since30 ? monthStart : since30),
      ]);
      const monthRows = rows.filter((r) => new Date(r.createdAt) >= monthStart);
      const byKind = new Map<string, { costUsd: number; requests: number }>();
      for (const r of monthRows) {
        const k = byKind.get(r.kind) ?? { costUsd: 0, requests: 0 };
        byKind.set(r.kind, { costUsd: k.costUsd + r.costUsd, requests: k.requests + 1 });
      }
      const byDay = new Map<string, number>();
      for (let i = 13; i >= 0; i--) byDay.set(localDate(new Date(now.getTime() - i * 86_400_000), profile.timezone), 0);
      for (const r of rows) {
        const d = localDate(new Date(r.createdAt), profile.timezone);
        if (byDay.has(d)) byDay.set(d, byDay.get(d)! + r.costUsd);
      }
      const round = (n: number) => Math.round(n * 10000) / 10000;
      return {
        today,
        last30Days: { costUsd: last30.costUsd, requests: last30.requests },
        dailyLimitUsd: profile.dailyCostLimitUsd,
        model: deps.orchestrator.modelFor(profile) ?? deps.provider.model,
        month: { costUsd: round(monthRows.reduce((s, r) => s + r.costUsd, 0)), requests: monthRows.length, limitUsd: profile.monthlyCostLimitUsd },
        byKind: [...byKind.entries()].map(([kind, v]) => ({ kind, costUsd: round(v.costUsd), requests: v.requests })).sort((a, b) => b.costUsd - a.costUsd),
        byDay: [...byDay.entries()].map(([date, costUsd]) => ({ date, costUsd: round(costUsd) })),
        economyMode: profile.economyMode,
        economyModel: deps.economyModel ?? null,
      };
    });

    // ---- Voz premium (opcional) ----
    v1.post("/tts", async (req, reply: FastifyReply) => {
      if (!deps.tts.configured) throw new AppError("tts_nao_configurado", 503, "Voz premium não configurada; usando a voz do iPhone.");
      const { text, voiceId, speed } = TtsRequestSchema.parse(req.body);
      await deps.orchestrator.assertWithinBudget(req.store, await req.store.getProfile());
      const { audio, contentType } = await deps.tts.synthesize(text, { voiceId, speed });
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
    await registerPhase4Routes(v1, deps.phase4 ?? { system: null, box: null, connectors: null, reports: null });
    await registerPhase5Routes(v1, { orchestrator: deps.orchestrator, memory: deps.memory ?? null });
  }, { prefix: "/v1" });

  await registerIntentRoutes(app, { system: deps.phase2?.system ?? null, google: deps.phase2?.google ?? null });

  if (deps.web) await registerWebApp(app, deps.web);

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
