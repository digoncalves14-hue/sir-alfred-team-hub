import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StreamEventSchema, UsageSummarySchema, type StreamEvent } from "@jarvis/shared";
import { buildApp } from "../src/app";
import { normalizeLoose, Orchestrator, startOfMonthInTimezone } from "../src/agent/orchestrator";
import { cosine, type EmbeddingsProvider } from "../src/ai/embeddings";
import { AppError } from "../src/errors";
import { MemoryIndex } from "../src/memory/index";
import { ExpoPushSender } from "../src/push/expo";
import { Scheduler } from "../src/scheduler/scheduler";
import { createMemoryDb, MemorySystemStore, MemoryUserStore } from "../src/store/memory-store";
import { createDefaultRegistry } from "../src/tools/builtin";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { FakeGoogle } from "./fake-google";
import { ScriptedProvider, call, text } from "./fake-provider";

/** Embeddings determinísticos por "conceito" (sinônimos caem na mesma dimensão). */
const CONCEPTS = [
  ["embalagem", "frasco", "pote", "lata", "rotulo"],
  ["reuniao", "encontro", "call", "conversa"],
  ["preco", "valor", "custo", "reais"],
  ["barba", "bigode"],
];
class FakeEmbeddings implements EmbeddingsProvider {
  readonly model = "fake-emb-1";
  readonly pricePerMTokens = 0.02;
  calls = 0;
  fail = false;
  async embed(texts: string[]) {
    this.calls++;
    if (this.fail) throw new Error("fora do ar");
    const vectors = texts.map((t) => {
      const words = normalizeLoose(t).split(" ");
      const v = CONCEPTS.map((group) => words.filter((w) => group.some((g) => w.startsWith(g))).length);
      return [...v, 0.05];
    });
    return { vectors, tokens: texts.join(" ").length };
  }
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKENS: Record<string, string> = { "token-a": A };
const auth = () => ({ authorization: "Bearer token-a" });

const provider = new ScriptedProvider([]);
const script = (...steps: ConstructorParameters<typeof ScriptedProvider>[0]) => {
  (provider as unknown as { steps: unknown[] }).steps = steps;
};
const db = createMemoryDb();
const embeddings = new FakeEmbeddings();
const memory = new MemoryIndex(embeddings);
const orchestrator = new Orchestrator({
  provider,
  registry: createDefaultRegistry(),
  maxToolIterations: 8,
  historyMessages: 4,
  memory,
  economyModel: "claude-haiku-5-5",
});
let app: Awaited<ReturnType<typeof buildApp>>;
const storeA = () => new MemoryUserStore(A, db);

function parseSse(payload: string): StreamEvent[] {
  return payload
    .split("\n\n")
    .map((block) => block.split("\n").find((l) => l.startsWith("data: ")))
    .filter((l): l is string => Boolean(l))
    .map((l) => StreamEventSchema.parse(JSON.parse(l.slice(6))));
}

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
    orchestrator,
    memory,
    economyModel: "claude-haiku-5-5",
  });
});
afterAll(() => app.close());

describe("streaming (SSE)", () => {
  it("envia o texto em pedaços, as ferramentas e a resposta final", async () => {
    script(
      () => ({ parts: [{ type: "text", text: "Vou verificar a hora." }, { type: "tool_call", id: "t1", name: "obter_data_hora", input: {} }] }),
      text("Agora são dez horas, senhor."),
    );
    const res = await app.inject({ method: "POST", url: "/v1/chat/stream", headers: auth(), payload: { message: "que horas são?" } });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(res.payload);
    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text);
    expect(deltas.length).toBeGreaterThan(4);
    expect(deltas.join("")).toBe("Vou verificar a hora.\nAgora são dez horas, senhor.");
    const tool = events.find((e) => e.type === "tool");
    expect(tool).toMatchObject({ event: { tool: "obter_data_hora", status: "executed" } });
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    // O texto salvo é exatamente o que foi falado
    expect(done.type === "done" && done.response.reply.content).toBe("Vou verificar a hora.\nAgora são dez horas, senhor.");
  });

  it("erros chegam como evento (ex.: limite diário)", async () => {
    const s = storeA();
    await s.updateProfile({ dailyCostLimitUsd: 0.001 });
    await s.recordUsage({ kind: "chat", provider: "x", model: "x", costUsd: 0.01 });
    const res = await app.inject({ method: "POST", url: "/v1/chat/stream", headers: auth(), payload: { message: "oi" } });
    const [ev] = parseSse(res.payload);
    expect(ev).toMatchObject({ type: "error", code: "limite_diario", status: 429 });
    await s.updateProfile({ dailyCostLimitUsd: 100 });
  });
});

describe("controle de custos", () => {
  it("modo econômico troca o modelo só quando o usuário liga", async () => {
    script(text("ok"));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "oi" } });
    expect(provider.requests.at(-1)!.model).toBeUndefined();
    await storeA().updateProfile({ economyMode: true });
    script(text("ok"));
    const r = await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "oi" } });
    expect(provider.requests.at(-1)!.model).toBe("claude-haiku-5-5");
    expect(r.statusCode).toBe(200);
    await storeA().updateProfile({ economyMode: false });
  });

  it("aviso único aos 80% do mês e bloqueio ao atingir o limite mensal", async () => {
    const s = storeA();
    await s.updateProfile({ monthlyCostLimitUsd: 1, dailyCostLimitUsd: 100 });
    const spent = (await s.usageSince(startOfMonthInTimezone(new Date(), "America/Sao_Paulo"))).costUsd;
    await s.recordUsage({ kind: "chat", provider: "x", model: "x", costUsd: Math.max(0, 0.85 - spent) });
    script(text("ok"));
    const first = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "oi" } })).json();
    expect(first.notice).toMatch(/Você já usou 8\d% do limite mensal/);
    script(text("ok"));
    expect((await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "oi" } })).json().notice).toBeUndefined();
    await s.recordUsage({ kind: "chat", provider: "x", model: "x", costUsd: 0.5 });
    const blocked = await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "oi" } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("limite_mensal");
    await s.updateProfile({ monthlyCostLimitUsd: 1000 });
  });

  it("painel de consumo por recurso e por dia", async () => {
    const u = UsageSummarySchema.parse((await app.inject({ url: "/v1/usage", headers: auth() })).json());
    expect(u.byDay).toHaveLength(14);
    expect(u.byKind.find((k) => k.kind === "chat")!.requests).toBeGreaterThan(0);
    expect(u.month.limitUsd).toBe(1000);
    expect(u.economyModel).toBe("claude-haiku-5-5");
  });
});

describe("memória semântica", () => {
  it("encontra por significado, mesmo sem palavras em comum", async () => {
    const s = storeA();
    for (const content of ["Decidimos trocar o frasco da pomada Black Bear por uma lata de alumínio", "Preferência: cortes às terças pela manhã"]) {
      const r = await app.inject({ method: "POST", url: "/v1/memories", headers: auth(), payload: { category: "decisao", space: "black_bear", content } });
      expect(r.statusCode).toBe(201);
    }
    expect((await s.listMemoryEmbeddings("fake-emb-1")).length).toBe(2);
    const found = await memory.search(s, { query: "o que ficou decidido sobre a embalagem?", limit: 3 });
    expect(found[0]!.content).toContain("lata de alumínio");
    expect(found.map((m) => m.content).join()).not.toContain("terças");
    const u = await s.usageRows(new Date(0));
    expect(u.some((r) => r.kind === "embedding")).toBe(true);
  });

  it("cai para busca por palavras se o serviço falhar; reindexa o que faltar", async () => {
    const s = storeA();
    embeddings.fail = true;
    const m = await s.createMemory({ category: "outro", space: "pessoal", content: "Reunião com contador toda sexta", source: "user" });
    expect(await memory.index(s, m)).toBe(false);
    expect((await memory.search(s, { query: "contador", limit: 3 }))[0]!.id).toBe(m.id);
    embeddings.fail = false;
    const r = await app.inject({ method: "POST", url: "/v1/memories/reindex", headers: auth() });
    expect(r.json().indexed).toBeGreaterThanOrEqual(1);
    expect((await memory.search(s, { query: "encontro semanal", limit: 1 }))[0]!.id).toBe(m.id);
  });

  it("cosseno básico", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });
});

describe("resumo automático de conversas longas", () => {
  it("resume as mensagens que saem da janela e usa o resumo no contexto", async () => {
    const steps = [text("r1"), text("r2"), text("r3")];
    script(...steps);
    const first = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "Vamos planejar a inauguração da unidade de Penápolis" } })).json();
    const cid = first.conversationId;
    for (const m of ["Data: 15 de dezembro", "Orçamento de R$ 8 mil"]) {
      await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: m, conversationId: cid } });
    }
    // 6 mensagens, janela 4 → o próximo turno gera o resumo antes de responder
    script((req) => {
      expect(req.tools).toHaveLength(0);
      expect(req.system).toContain("Resuma a conversa");
      return { parts: [{ type: "text", text: "- Inauguração em Penápolis\n- Data: 15/12" }] };
    }, text("Certo."));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "e o cardápio?", conversationId: cid } });
    expect(provider.requests.at(-1)!.context).toContain("Inauguração em Penápolis");
    expect((await storeA().getConversationSummary(cid)).upto).toBe(2);
    expect((await storeA().usageRows(new Date(0))).some((r) => r.kind === "summary")).toBe(true);
  });
});

describe("rotinas e múltiplas etapas", () => {
  it("cria rotina, valida frase/agenda e executa pela frase de ativação", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/routines",
      headers: auth(),
      payload: { name: "Abertura da barbearia", triggerPhrase: "abertura da barbearia", instructions: "1) Diga a hora. 2) Liste minhas tarefas de hoje." },
    });
    expect(r.statusCode).toBe(201);
    const routine = r.json().routine;
    expect((await app.inject({ method: "POST", url: "/v1/routines", headers: auth(), payload: { name: "x", triggerPhrase: "Abertura da Barbearia!", instructions: "fazer algo" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/v1/routines", headers: auth(), payload: { name: "y", triggerPhrase: "outra frase", instructions: "fazer algo", scheduleEnabled: true } })).statusCode).toBe(400);

    script(call("obter_data_hora", {}), call("tarefa_listar", {}, "t2"), text("São dez horas e você não tem tarefas."));
    const chat = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "Jarvis, abertura da barbearia" } })).json();
    const sent = provider.requests.at(-3)!.turns.at(-1)!.parts[0]!;
    expect(sent.type === "text" && sent.text).toContain('[Rotina "Abertura da barbearia"');
    expect(sent.type === "text" && sent.text).toContain("Liste minhas tarefas de hoje");
    expect(chat.reply.toolEvents.map((e: { tool: string }) => e.tool)).toEqual(["obter_data_hora", "tarefa_listar"]);

    // Execução por id (notificação agendada) sem texto do usuário
    script(text("Feito."));
    const byId = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: " ", routineId: routine.id } }));
    expect(byId.statusCode).toBe(400); // mensagem vazia é recusada pelo contrato
    script(text("Feito."));
    await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "executar rotina", routineId: routine.id } });
    const part = provider.requests.at(-1)!.turns.at(-1)!.parts[0]!;
    expect(part.type === "text" && part.text).not.toContain("Pedido original");
  });

  it("confirma várias ações pendentes de uma vez", async () => {
    const s = storeA();
    const t1 = await s.createTask({ title: "Comprar toalhas", space: "sir_alfred", priority: "normal" });
    const t2 = await s.createTask({ title: "Comprar café", space: "sir_alfred", priority: "normal" });
    script(call("tarefa_apagar", { id: t1.id }, "a"), call("tarefa_apagar", { id: t2.id }, "b"), text("Confirme as duas."));
    const res = (await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "apague as duas tarefas de compras" } })).json();
    const ids = res.reply.toolEvents.map((e: { pendingActionId: string }) => e.pendingActionId);
    expect(ids).toHaveLength(2);
    const batch = (await app.inject({ method: "POST", url: "/v1/actions/confirm-batch", headers: auth(), payload: { ids } })).json();
    expect(batch.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(await s.getTask(t1.id)).toBeNull();
    expect(await s.getTask(t2.id)).toBeNull();
  });

  it("rotina agendada gera um aviso por período, que abre a rotina no app", async () => {
    const google = new FakeGoogle();
    const system = new MemorySystemStore(db);
    await system.upsertPushToken(A, "ExponentPushToken[a]");
    await storeA().updateProfile({ dailySummaryEnabled: false });
    db.automations = [];
    const r = await storeA().createRoutine({
      name: "Fechamento do dia",
      triggerPhrase: "fechamento do dia",
      instructions: "Resuma tarefas abertas.",
      weekday: null,
      runTime: "19:00",
      scheduleEnabled: true,
      enabled: true,
    });
    let clock = new Date("2026-11-09T22:05:00Z"); // 19:05 em SP
    const scheduler = new Scheduler({ system, google: null, push: new ExpoPushSender(system, { fetchImpl: google.fetch }), clock: () => clock });
    expect((await scheduler.tick()).routines).toBe(1);
    expect((await scheduler.tick()).routines).toBe(0);
    expect(google.pushes.at(-1)).toMatchObject({ title: "Rotina: Fechamento do dia", data: { url: `jarvis://?rotina=${r.id}` } });
    clock = new Date("2026-11-10T22:05:00Z");
    expect((await scheduler.tick()).routines).toBe(1);
  });
});
