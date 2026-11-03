import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatResponseSchema, DeviceActionSchema, PendingActionSchema } from "@jarvis/shared";
import { buildApp } from "../src/app";
import { Orchestrator } from "../src/agent/orchestrator";
import { buildContext } from "../src/agent/prompt";
import { AppError } from "../src/errors";
import { GoogleGateway } from "../src/google/gateway";
import { GoogleOAuth } from "../src/google/oauth";
import { SecretBox } from "../src/security/crypto";
import { createMemoryDb, DEFAULT_PROFILE, MemorySystemStore, MemoryUserStore } from "../src/store/memory-store";
import { createDefaultRegistry } from "../src/tools/builtin";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { FakeGoogle } from "./fake-google";
import { ScriptedProvider, call, text } from "./fake-provider";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKENS: Record<string, string> = { "token-a": A, "token-b": B };
const auth = (t = "token-a") => ({ authorization: `Bearer ${t}` });

const provider = new ScriptedProvider([]);
const script = (...steps: ConstructorParameters<typeof ScriptedProvider>[0]) => {
  (provider as unknown as { steps: unknown[] }).steps = steps;
};
const fake = new FakeGoogle();
const db = createMemoryDb();
const system = new MemorySystemStore(db);
const box = new SecretBox(randomBytes(32).toString("base64"));
const google = new GoogleGateway({ oauth: new GoogleOAuth("123-abc.apps.googleusercontent.com", box, fake.fetch), system, box, fetchImpl: fake.fetch });
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({
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
    orchestrator: new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 4, historyMessages: 20, googleFor: (id) => google.forUser(id) }),
    phase2: { system, google, box },
  });
});
afterAll(() => app.close());

describe("ações executadas no iPhone", () => {
  it("lembrete no iPhone: pendente com a ação para o app; só conclui quando o aparelho reporta", async () => {
    script(call("iphone_criar_lembrete", { titulo: "Comprar lâminas", data_hora: "2026-11-05T09:00" }), text("Confirme no cartão."));
    const res = ChatResponseSchema.parse(
      (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "crie um lembrete no iPhone para comprar lâminas" } })).json(),
    );
    const ev = res.reply.toolEvents[0]!;
    expect(ev).toMatchObject({ status: "pending", device: { kind: "lembrete_iphone", input: { titulo: "Comprar lâminas", dataHora: "2026-11-05T09:00" } } });
    expect(ev.summary).toContain("app Lembretes do iPhone");

    // A lista de pendentes entrega a ação validada para o app executar
    const pending = (await app.inject({ url: "/v1/actions/pending", headers: auth() })).json().actions.map((a: unknown) => PendingActionSchema.parse(a));
    const mine = pending.find((p: { id: string }) => p.id === ev.pendingActionId)!;
    expect(mine.executor).toBe("device");
    expect(DeviceActionSchema.parse(mine.device).kind).toBe("lembrete_iphone");

    // O servidor recusa executar ação do aparelho
    expect((await app.inject({ method: "POST", url: `/v1/actions/${ev.pendingActionId}/confirm`, headers: auth() })).statusCode).toBe(409);
    // Outro usuário não pode reportar
    expect((await app.inject({ method: "POST", url: `/v1/actions/${ev.pendingActionId}/report`, headers: auth("token-b"), payload: { success: true, summary: "x" } })).statusCode).toBe(404);

    const rep = await app.inject({ method: "POST", url: `/v1/actions/${ev.pendingActionId}/report`, headers: auth(), payload: { success: true, summary: 'Lembrete "Comprar lâminas" criado' } });
    expect(rep.statusCode).toBe(200);
    expect(rep.json()).toMatchObject({ action: { status: "confirmed" }, message: 'Feito no iPhone: Lembrete "Comprar lâminas" criado.' });
    expect((await app.inject({ method: "POST", url: `/v1/actions/${ev.pendingActionId}/report`, headers: auth(), payload: { success: true, summary: "x" } })).statusCode).toBe(409);
  });

  it("falha relatada pelo aparelho fica registrada como falha (sem sucesso falso)", async () => {
    script(call("iphone_criar_evento", { titulo: "Aula", inicio: "2026-11-06T19:00" }), text("Confirme."));
    const res = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "evento no iPhone" } })).json();
    const id = res.reply.toolEvents[0].pendingActionId;
    const rep = await app.inject({ method: "POST", url: `/v1/actions/${id}/report`, headers: auth(), payload: { success: false, summary: "Sem permissão para o Calendário" } });
    expect(rep.json().action.status).toBe("failed");
    const audit = (await app.inject({ url: "/v1/audit", headers: auth() })).json().entries;
    expect(audit.some((e: { status: string; summary: string }) => e.status === "failed" && e.summary.includes("Sem permissão"))).toBe(true);
  });

  it("WhatsApp/ligação: valida entrada, descreve com clareza e não envia nada sozinho", async () => {
    script(
      () => ({
        parts: [
          { type: "tool_call", id: "a", name: "abrir_comunicacao", input: { canal: "whatsapp" } },
          { type: "tool_call", id: "b", name: "abrir_comunicacao", input: { canal: "link", destino: "http://inseguro.com" } },
          { type: "tool_call", id: "c", name: "abrir_comunicacao", input: { canal: "whatsapp", contato: "Rafael Barbeiro", mensagem: "Chego às 10h." } },
        ],
      }),
      text("Abrindo o WhatsApp após confirmação."),
    );
    const res = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "mande no zap pro Rafael que chego às 10" } })).json();
    const events = res.reply.toolEvents;
    expect(events).toHaveLength(1); // as duas entradas inválidas não viram ação
    expect(events[0].summary).toBe('Abrir o WhatsApp com Rafael Barbeiro com a mensagem: "Chego às 10h." (você ainda toca em Enviar).');
    expect(events[0].device).toEqual({ kind: "comunicacao", input: { canal: "whatsapp", contato: "Rafael Barbeiro", mensagem: "Chego às 10h." } });
  });

  it("toda ferramenta do iPhone exige confirmação", () => {
    const reg = createDefaultRegistry();
    for (const n of ["iphone_criar_lembrete", "iphone_criar_evento", "abrir_comunicacao"]) {
      expect(reg.get(n)?.risk).toBe("confirm");
      expect(reg.get(n)?.deviceAction).toBeTypeOf("function");
    }
  });
});

describe("contexto do iPhone", () => {
  it("entra no contexto como dado não confiável e com limites validados", async () => {
    const ctx = buildContext(DEFAULT_PROFILE, new Date("2026-11-03T13:00:00Z"), [], undefined, {
      calendar: [{ title: "Dentista", start: "2026-11-03T16:00", end: "2026-11-03T17:00", allDay: false, calendar: "iCloud" }],
      reminders: [{ title: "Pagar luz", due: "2026-11-04", list: "Casa" }],
      location: { city: "São Paulo", region: "SP", latitude: -23.5613, longitude: -46.6565 },
    });
    expect(ctx).toContain('<dados_externos origem="iphone">');
    expect(ctx).toContain("2026-11-03T16:00 → 2026-11-03T17:00 Dentista [iCloud]");
    expect(ctx).toContain("Pagar luz (até 2026-11-04) [Casa]");
    expect(ctx).toContain("Localização aproximada: São Paulo, SP (-23.56, -46.66)");

    script(text("Você tem dentista às 16h."));
    const ok = await app.inject({
      method: "POST",
      url: "/v1/chat",
      headers: auth(),
      payload: { message: "o que tenho hoje no iPhone?", deviceContext: { calendar: [{ title: "Dentista", start: "2026-11-03T16:00", end: "2026-11-03T17:00", allDay: false }] } },
    });
    expect(ok.statusCode).toBe(200);
    expect(provider.requests.at(-1)!.context).toContain("Dentista");
    const tooMany = Array.from({ length: 41 }, () => ({ title: "x", start: "a", end: "b", allDay: false }));
    expect((await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "x", deviceContext: { calendar: tooMany } } })).statusCode).toBe(400);
  });
});

describe("Siri/Atalhos em segundo plano (token de aparelho)", () => {
  let token = "";
  const dev = (t = token) => ({ authorization: `Device ${t}` });

  it("cria token uma vez; só o hash fica guardado; lista sem segredo", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/device-tokens", headers: auth(), payload: { name: "iPhone 16 Pro Max" } });
    expect(r.statusCode).toBe(201);
    token = r.json().token;
    expect(token).toMatch(/^jdt_/);
    expect(JSON.stringify(db.deviceTokens)).not.toContain(token);
    const list = (await app.inject({ url: "/v1/device-tokens", headers: auth() })).json().tokens;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/jdt_|hash/i);
    expect((await app.inject({ url: "/v1/device-tokens", headers: auth("token-b") })).json().tokens).toHaveLength(0);
  });

  it("intents exigem token válido; a sessão normal NÃO serve aqui", async () => {
    expect((await app.inject({ url: "/v1/intents/summary" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/intents/summary", headers: auth() })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/intents/summary", headers: dev("jdt_invalidoinvalidoinvalido") })).statusCode).toBe(401);
    // e o token de aparelho NÃO dá acesso às rotas completas
    expect((await app.inject({ url: "/v1/memories", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });

  it("resumo do dia, agenda, tarefa e memória pela Siri", async () => {
    const sum = await app.inject({ url: "/v1/intents/summary", headers: dev() });
    expect(sum.statusCode).toBe(200);
    expect(sum.json().speech).toMatch(/^Certo, senhor\./);

    expect((await app.inject({ url: "/v1/intents/agenda?dia=amanha", headers: dev() })).json().speech).toContain("Google Agenda não está conectado");

    const t = await app.inject({ method: "POST", url: "/v1/intents/tasks", headers: dev(), payload: { titulo: "Repor estoque de pomada" } });
    expect(t.json().speech).toBe("Tarefa registrada: Repor estoque de pomada.");
    expect((await new MemoryUserStore(A, db).listTasks({})).map((x) => x.title)).toContain("Repor estoque de pomada");

    const m = await app.inject({ method: "POST", url: "/v1/intents/memory", headers: dev(), payload: { texto: "Fornecedor novo de toalhas: Têxtil Lima." } });
    expect(m.json().speech).toBe("Guardado na memória do Jarvis.");
    const blocked = await app.inject({ method: "POST", url: "/v1/intents/memory", headers: dev(), payload: { texto: "senha do wifi: 12345678" } });
    expect(blocked.json().speech).toContain("Nada foi salvo");

    const audit = (await app.inject({ url: "/v1/audit", headers: auth() })).json().entries.map((e: { tool: string }) => e.tool);
    expect(audit).toEqual(expect.arrayContaining(["siri:resumo_do_dia", "siri:registrar_tarefa", "siri:salvar_memoria"]));
  });

  it("agenda pela Siri com Google conectado", async () => {
    await system.upsertIntegration({ userId: A, provider: "google", accountEmail: "a@x.com", scopes: [], services: ["calendar"], encryptedRefreshToken: box.encrypt("rt") });
    const now = new Date();
    const tz = "America/Sao_Paulo";
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    fake.addEvent("Reunião Barton", `${local}T23:00`, `${local}T23:30`);
    const r = await app.inject({ url: "/v1/intents/agenda?dia=hoje", headers: dev() });
    expect(r.json().speech).toBe("Hoje você tem 1 compromisso: 23:00, Reunião Barton.");
  });

  it("revogar corta o acesso imediatamente", async () => {
    const id = (await app.inject({ url: "/v1/device-tokens", headers: auth() })).json().tokens[0].id;
    expect((await app.inject({ method: "DELETE", url: `/v1/device-tokens/${id}`, headers: auth("token-b") })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/device-tokens/${id}`, headers: auth() })).statusCode).toBe(204);
    expect((await app.inject({ url: "/v1/intents/summary", headers: dev() })).statusCode).toBe(401);
  });
});
