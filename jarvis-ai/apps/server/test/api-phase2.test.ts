import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HealthSchema, IntegrationStatusSchema, TaskSchema, TodaySchema } from "@jarvis/shared";
import { buildApp } from "../src/app";
import { Orchestrator } from "../src/agent/orchestrator";
import { AppError } from "../src/errors";
import { GoogleGateway } from "../src/google/gateway";
import { GoogleOAuth } from "../src/google/oauth";
import { ExpoPushSender } from "../src/push/expo";
import { Scheduler } from "../src/scheduler/scheduler";
import { SecretBox } from "../src/security/crypto";
import { createMemoryDb, MemorySystemStore, MemoryUserStore } from "../src/store/memory-store";
import { createDefaultRegistry } from "../src/tools/builtin";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { FakeGoogle } from "./fake-google";
import { ScriptedProvider } from "./fake-provider";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKENS: Record<string, string> = { "token-a": A, "token-b": B };
const auth = (t = "token-a") => ({ authorization: `Bearer ${t}` });
const CRON = "segredo-do-cron-123456";

async function makeApp(withGoogle: boolean) {
  const fake = new FakeGoogle();
  const db = createMemoryDb();
  const system = new MemorySystemStore(db);
  const box = new SecretBox(randomBytes(32).toString("base64"));
  const google = withGoogle
    ? new GoogleGateway({ oauth: new GoogleOAuth("123-abc.apps.googleusercontent.com", box, fake.fetch), system, box, fetchImpl: fake.fetch })
    : null;
  const provider = new ScriptedProvider([]);
  const scheduler = new Scheduler({ system, google, push: new ExpoPushSender(system, { fetchImpl: fake.fetch }) });
  const app = await buildApp({
    logger: false,
    authenticate: async (token) => {
      const userId = TOKENS[token];
      if (!userId) throw new AppError("nao_autenticado", 401, "Sessão inválida");
      return new MemoryUserStore(userId, db);
    },
    provider,
    tts: new ElevenLabsTts({ modelId: "x" }),
    ttsCostPer1kChars: 0.1,
    rateLimitPerMinute: 1000,
    orchestrator: new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 4, historyMessages: 20 }),
    phase2: { system: withGoogle ? system : null, google, box: withGoogle ? box : null },
    scheduler: withGoogle ? scheduler : null,
    cronSecret: CRON,
  });
  return { app, fake, db, system };
}

describe("API Fase 2 — sem Google configurado", () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeAll(async () => (ctx = await makeApp(false)));
  afterAll(() => ctx.app.close());

  it("informa indisponibilidade com clareza", async () => {
    const h = HealthSchema.parse((await ctx.app.inject({ url: "/health" })).json());
    expect(h.google.configured).toBe(false);
    expect(h.scheduler).toEqual({ running: false, cron: false });
    const list = await ctx.app.inject({ url: "/v1/integrations", headers: auth() });
    expect(IntegrationStatusSchema.parse(list.json().integrations[0])).toMatchObject({ available: false, connected: false });
    const start = await ctx.app.inject({ method: "POST", url: "/v1/integrations/google/start", headers: auth(), payload: { services: ["calendar"] } });
    expect(start.statusCode).toBe(503);
    expect(start.json().error.message).toContain("GOOGLE_IOS_CLIENT_ID");
  });

  it("tarefas funcionam sem integrações e são isoladas por usuário", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/v1/tasks",
      headers: auth(),
      payload: { title: "Revisar estoque", space: "black_bear", priority: "alta", dueDate: "2026-11-05", remindAt: "2026-11-05T09:00:00-03:00" },
    });
    expect(created.statusCode).toBe(201);
    const task = TaskSchema.parse(created.json().task);
    expect(task.remindAt).toBe("2026-11-05T12:00:00.000Z");

    expect((await ctx.app.inject({ url: "/v1/tasks", headers: auth("token-b") })).json().tasks).toHaveLength(0);
    expect((await ctx.app.inject({ method: "PATCH", url: `/v1/tasks/${task.id}`, headers: auth("token-b"), payload: { status: "concluida" } })).statusCode).toBe(404);

    const done = await ctx.app.inject({ method: "PATCH", url: `/v1/tasks/${task.id}`, headers: auth(), payload: { status: "concluida" } });
    expect(done.json().task.status).toBe("concluida");
    expect((await ctx.app.inject({ url: "/v1/tasks", headers: auth() })).json().tasks).toHaveLength(0);
    expect((await ctx.app.inject({ url: "/v1/tasks?status=todas", headers: auth() })).json().tasks).toHaveLength(1);
    expect((await ctx.app.inject({ method: "POST", url: "/v1/tasks", headers: auth(), payload: { title: "" } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "DELETE", url: `/v1/tasks/${task.id}`, headers: auth() })).statusCode).toBe(204);
  });

  it("/v1/today funciona e mostra agenda desconectada", async () => {
    const today = TodaySchema.parse((await ctx.app.inject({ url: "/v1/today", headers: auth() })).json());
    expect(today.calendar.connected).toBe(false);
  });

  it("cron externo fica oculto sem agendador", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/internal/cron/tick", headers: { "x-cron-secret": CRON } })).statusCode).toBe(404);
  });
});

describe("API Fase 2 — com Google", () => {
  let ctx: Awaited<ReturnType<typeof makeApp>>;
  beforeAll(async () => (ctx = await makeApp(true)));
  afterAll(() => ctx.app.close());

  it("conecta via OAuth, guarda só o token CIFRADO e mostra o status", async () => {
    const start = await ctx.app.inject({ method: "POST", url: "/v1/integrations/google/start", headers: auth(), payload: { services: ["calendar", "gmail"] } });
    expect(start.statusCode).toBe(200);
    const state = new URL(start.json().authUrl).searchParams.get("state")!;

    // O state de A não serve para B
    const stolen = await ctx.app.inject({ method: "POST", url: "/v1/integrations/google/complete", headers: auth("token-b"), payload: { code: "code-ok", state } });
    expect(stolen.statusCode).toBe(400);

    const done = await ctx.app.inject({ method: "POST", url: "/v1/integrations/google/complete", headers: auth(), payload: { code: "code-ok", state } });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ connected: true, accountEmail: "dono@exemplo.com", services: ["calendar", "gmail"] });

    const stored = ctx.db.integrations[0]!;
    expect(stored.encryptedRefreshToken).not.toContain("rt-secret-123");
    expect(JSON.stringify(done.json())).not.toContain("rt-secret");

    const status = (await ctx.app.inject({ url: "/v1/integrations", headers: auth() })).json().integrations[0];
    expect(status).toMatchObject({ available: true, connected: true, services: ["calendar", "gmail"] });
    expect(JSON.stringify(status)).not.toContain("encrypted");
    expect((await ctx.app.inject({ url: "/v1/integrations", headers: auth("token-b") })).json().integrations[0].connected).toBe(false);
  });

  it("desconectar revoga o acesso no Google e apaga o token", async () => {
    const del = await ctx.app.inject({ method: "DELETE", url: "/v1/integrations/google", headers: auth() });
    expect(del.statusCode).toBe(204);
    expect(ctx.fake.revoked).toEqual(["rt-secret-123"]);
    expect(ctx.db.integrations).toHaveLength(0);
  });

  it("registra token de push validando o formato", async () => {
    expect((await ctx.app.inject({ method: "POST", url: "/v1/push-tokens", headers: auth(), payload: { token: "qualquer" } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "POST", url: "/v1/push-tokens", headers: auth(), payload: { token: "ExponentPushToken[xyz]", deviceName: "iPhone 16 Pro Max" } })).statusCode).toBe(204);
    expect(await ctx.system.listPushTokens(A)).toEqual(["ExponentPushToken[xyz]"]);
  });

  it("cron externo exige o segredo e executa o agendador", async () => {
    expect(HealthSchema.parse((await ctx.app.inject({ url: "/health" })).json()).scheduler).toEqual({ running: false, cron: true });
    expect((await ctx.app.inject({ method: "POST", url: "/internal/cron/tick", headers: { "x-cron-secret": "errado" } })).statusCode).toBe(404);
    const ok = await ctx.app.inject({ method: "POST", url: "/internal/cron/tick", headers: { "x-cron-secret": CRON } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toHaveProperty("reminders");
  });

  it("notificações: lista e marca como lida somente as próprias", async () => {
    const id = await ctx.system.insertNotification({ userId: A, kind: "sistema", title: "Oi", body: "Teste", dedupeKey: "t1" });
    expect((await ctx.app.inject({ url: "/v1/notifications", headers: auth() })).json().notifications).toHaveLength(1);
    expect((await ctx.app.inject({ method: "POST", url: `/v1/notifications/${id}/read`, headers: auth("token-b") })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "POST", url: `/v1/notifications/${id}/read`, headers: auth() })).statusCode).toBe(204);
  });
});
