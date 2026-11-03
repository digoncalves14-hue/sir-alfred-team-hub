/** Rotas da Fase 2: integrações Google, tarefas, "hoje", notificações e push. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  OAuthCompleteRequestSchema,
  OAuthStartRequestSchema,
  PushTokenRequestSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  type IntegrationStatus,
} from "@jarvis/shared";
import { AppError, notFound } from "../errors";
import { buildDay } from "../agent/summary";
import { localDate } from "../agent/time";
import type { GoogleGateway } from "../google/gateway";
import { IntegrationError } from "../google/errors";
import type { SecretBox } from "../security/crypto";
import type { SystemStore } from "../store/types";

export interface Phase2Deps {
  system: SystemStore | null;
  google: GoogleGateway | null;
  box: SecretBox | null;
}

const IdParams = z.object({ id: z.string().uuid() });

export async function registerPhase2Routes(v1: FastifyInstance, deps: Phase2Deps) {
  const requireGoogle = () => {
    if (!deps.google || !deps.system || !deps.box) {
      throw new AppError(
        "google_nao_configurado",
        503,
        "A integração com o Google não está configurada no servidor (GOOGLE_IOS_CLIENT_ID, TOKEN_ENCRYPTION_KEY e SUPABASE_SERVICE_ROLE_KEY).",
      );
    }
    return { google: deps.google, system: deps.system, box: deps.box };
  };
  const toApp = (e: unknown) => (e instanceof IntegrationError ? new AppError(e.code, e.status && e.status < 500 ? e.status : 502, e.message) : e);

  // ---- Integrações ----
  v1.get("/integrations", async (req): Promise<{ integrations: IntegrationStatus[] }> => {
    const info = await req.store.getIntegration("google");
    return {
      integrations: [
        {
          provider: "google",
          available: Boolean(deps.google && deps.system && deps.box),
          connected: Boolean(info && info.status !== "revoked"),
          accountEmail: info?.accountEmail ?? null,
          services: info?.services ?? [],
          status: info?.status ?? null,
          lastError: info?.lastError ?? null,
          connectedAt: info?.connectedAt ?? null,
        },
      ],
    };
  });

  v1.post("/integrations/google/start", async (req) => {
    const { google } = requireGoogle();
    const { services } = OAuthStartRequestSchema.parse(req.body);
    return google.oauth.start(req.store.userId, [...new Set(services)]);
  });

  v1.post("/integrations/google/complete", async (req) => {
    const { google, system, box } = requireGoogle();
    const { code, state } = OAuthCompleteRequestSchema.parse(req.body);
    try {
      const tokens = await google.oauth.complete(req.store.userId, code, state);
      await system.upsertIntegration({
        userId: req.store.userId,
        provider: "google",
        accountEmail: tokens.email,
        scopes: tokens.scopes,
        services: tokens.services,
        encryptedRefreshToken: box.encrypt(tokens.refreshToken),
      });
      google.forget(req.store.userId);
      await req.store.logAction({ tool: "app:conectar_google", status: "executed", summary: `Google conectado (${tokens.services.join(", ")})${tokens.email ? ` — ${tokens.email}` : ""}` });
      return { connected: true, accountEmail: tokens.email, services: tokens.services };
    } catch (e) {
      throw toApp(e);
    }
  });

  v1.delete("/integrations/google", async (req, reply) => {
    const { google, system, box } = requireGoogle();
    const secret = await system.getIntegrationSecret(req.store.userId, "google");
    if (!secret) throw notFound("Integração");
    // Revoga no Google (melhor esforço) e apaga o token do banco.
    try {
      await google.oauth.revoke(box.decrypt(secret.encryptedRefreshToken));
    } catch {
      /* token ilegível: segue apagando */
    }
    await system.deleteIntegration(req.store.userId, "google");
    google.forget(req.store.userId);
    await req.store.logAction({ tool: "app:desconectar_google", status: "executed", summary: "Google desconectado e acesso revogado" });
    return reply.status(204).send();
  });

  // ---- Tarefas ----
  v1.get("/tasks", async (req) => {
    const q = z.object({ status: z.enum(["aberta", "concluida", "todas"]).default("aberta") }).parse(req.query);
    return { tasks: await req.store.listTasks({ status: q.status, limit: 200 }) };
  });
  v1.post("/tasks", async (req, reply) => {
    const body = TaskCreateSchema.parse(req.body);
    const task = await req.store.createTask({ ...body, remindAt: body.remindAt ? new Date(body.remindAt).toISOString() : undefined });
    return reply.status(201).send({ task });
  });
  v1.patch("/tasks/:id", async (req) => {
    const { id } = IdParams.parse(req.params);
    const patch = TaskUpdateSchema.parse(req.body);
    const task = await req.store.updateTask(id, { ...patch, remindAt: patch.remindAt ? new Date(patch.remindAt).toISOString() : patch.remindAt });
    if (!task) throw notFound("Tarefa");
    return { task };
  });
  v1.delete("/tasks/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.deleteTask(id))) throw notFound("Tarefa");
    await req.store.logAction({ tool: "app:apagar_tarefa", status: "executed", summary: "Tarefa apagada pelo usuário" });
    return reply.status(204).send();
  });

  // ---- Hoje (agenda + tarefas + e-mail) ----
  v1.get("/today", async (req) => {
    const profile = await req.store.getProfile();
    const date = localDate(new Date(), profile.timezone);
    const tasks = await req.store.listTasks({ status: "aberta", dueOnOrBefore: date, limit: 50 });
    return buildDay(deps.google?.forUser(req.store.userId) ?? null, tasks, date, profile.timezone);
  });

  // ---- Notificações ----
  v1.get("/notifications", async (req) => ({ notifications: await req.store.listNotifications(50) }));
  v1.post("/notifications/:id/read", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (!(await req.store.markNotificationRead(id))) throw notFound("Notificação");
    return reply.status(204).send();
  });

  v1.post("/push-tokens", async (req, reply) => {
    if (!deps.system) throw new AppError("push_nao_configurado", 503, "Notificações push exigem SUPABASE_SERVICE_ROLE_KEY no servidor.");
    const body = PushTokenRequestSchema.parse(req.body);
    await deps.system.upsertPushToken(req.store.userId, body.token, body.deviceName);
    return reply.status(204).send();
  });
  v1.delete("/push-tokens", async (req, reply) => {
    if (!deps.system) throw new AppError("push_nao_configurado", 503, "Notificações push não configuradas.");
    const body = PushTokenRequestSchema.pick({ token: true }).parse(req.body);
    await deps.system.deleteUserPushToken(req.store.userId, body.token);
    return reply.status(204).send();
  });
}
