import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { Orchestrator } from "../src/agent/orchestrator";
import { createDefaultRegistry } from "../src/tools/builtin";
import { createMemoryDb, MemoryUserStore } from "../src/store/memory-store";
import { AppError } from "../src/errors";
import { ElevenLabsTts } from "../src/tts/elevenlabs";
import { ChatResponseSchema, HealthSchema } from "@jarvis/shared";
import { ScriptedProvider, call, text } from "./fake-provider";

const TOKENS: Record<string, string> = {
  "token-a": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "token-b": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

const provider = new ScriptedProvider([]);
const db = createMemoryDb();
const tts = new ElevenLabsTts({ modelId: "eleven_flash_v2_5" }); // sem chave → não configurado
let app: Awaited<ReturnType<typeof buildApp>>;

const auth = (t = "token-a") => ({ authorization: `Bearer ${t}` });
function script(...steps: ConstructorParameters<typeof ScriptedProvider>[0]) {
  (provider as unknown as { steps: unknown[] }).steps = steps;
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
    tts,
    ttsCostPer1kChars: 0.1,
    rateLimitPerMinute: 1000,
    orchestrator: new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 4, historyMessages: 20 }),
  });
});
afterAll(() => app.close());

describe("API", () => {
  it("health não exige login e informa configuração", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = HealthSchema.parse(res.json());
    expect(body.ai.configured).toBe(true);
    expect(body.tts.configured).toBe(false);
  });

  it("exige autenticação em /v1", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: auth("invalido") })).statusCode).toBe(401);
  });

  it("perfil: lê e personaliza a forma de tratamento", async () => {
    const res = await app.inject({ method: "PATCH", url: "/v1/settings", headers: auth(), payload: { ownerName: "Sr. Diego" } });
    expect(res.json().profile.ownerName).toBe("Sr. Diego");
    expect((await app.inject({ method: "PATCH", url: "/v1/settings", headers: auth(), payload: { timezone: "Marte/Base" } })).statusCode).toBe(400);
  });

  it("chat: valida entrada e responde no contrato", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "" } })).statusCode).toBe(400);
    script(text("Bom dia, Sr. Diego."));
    const res = await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "Jarvis, bom dia", inputMode: "voice" } });
    expect(res.statusCode).toBe(200);
    const body = ChatResponseSchema.parse(res.json());
    expect(body.reply.content).toBe("Bom dia, Sr. Diego.");

    const list = await app.inject({ method: "GET", url: "/v1/conversations", headers: auth() });
    expect(list.json().conversations).toHaveLength(1);
    const msgs = await app.inject({ method: "GET", url: `/v1/conversations/${body.conversationId}/messages`, headers: auth() });
    expect(msgs.json().messages).toHaveLength(2);
  });

  it("isola dados entre usuários", async () => {
    const list = await app.inject({ method: "GET", url: "/v1/conversations", headers: auth("token-b") });
    expect(list.json().conversations).toHaveLength(0);
  });

  it("memória: criar, corrigir, buscar, apagar e bloquear dado sensível", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: auth(),
      payload: { category: "decisao", space: "black_bear", content: "Lançar kit barba em dezembro" },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().memory.id;

    const patched = await app.inject({ method: "PATCH", url: `/v1/memories/${id}`, headers: auth(), payload: { content: "Lançar kit barba em janeiro" } });
    expect(patched.json().memory.content).toContain("janeiro");

    const found = await app.inject({ method: "GET", url: "/v1/memories?q=kit%20barba&space=black_bear", headers: auth() });
    expect(found.json().memories).toHaveLength(1);

    const other = await app.inject({ method: "DELETE", url: `/v1/memories/${id}`, headers: auth("token-b") });
    expect(other.statusCode).toBe(404); // outro usuário não apaga

    expect((await app.inject({ method: "DELETE", url: `/v1/memories/${id}`, headers: auth() })).statusCode).toBe(204);

    const bad = await app.inject({ method: "POST", url: "/v1/memories", headers: auth(), payload: { category: "outro", content: "senha: 1234abcd" } });
    expect(bad.statusCode).toBe(422);
  });

  it("fluxo completo de confirmação via HTTP", async () => {
    const created = await app.inject({ method: "POST", url: "/v1/memories", headers: auth(), payload: { category: "outro", content: "Anotação temporária" } });
    const memId = created.json().memory.id;
    script(call("apagar_memoria", { id: memId }), text("Confirme no cartão, por favor."));
    const chat = await app.inject({ method: "POST", url: "/v1/chat", headers: auth(), payload: { message: "apague a anotação temporária" } });
    const pendingId = chat.json().reply.toolEvents[0].pendingActionId;

    const pending = await app.inject({ method: "GET", url: "/v1/actions/pending", headers: auth() });
    expect(pending.json().actions.map((a: { id: string }) => a.id)).toContain(pendingId);

    // Outro usuário não consegue confirmar
    expect((await app.inject({ method: "POST", url: `/v1/actions/${pendingId}/confirm`, headers: auth("token-b") })).statusCode).toBe(404);

    const ok = await app.inject({ method: "POST", url: `/v1/actions/${pendingId}/confirm`, headers: auth() });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().action.status).toBe("confirmed");
    expect((await app.inject({ method: "POST", url: `/v1/actions/${pendingId}/confirm`, headers: auth() })).statusCode).toBe(409);

    const audit = await app.inject({ method: "GET", url: "/v1/audit", headers: auth() });
    expect(audit.json().entries.some((e: { status: string }) => e.status === "confirmed")).toBe(true);
  });

  it("consumo e exportação", async () => {
    const usage = await app.inject({ method: "GET", url: "/v1/usage", headers: auth() });
    expect(usage.json().today.requests).toBeGreaterThan(0);
    const exp = await app.inject({ method: "GET", url: "/v1/export", headers: auth() });
    expect(exp.headers["content-disposition"]).toContain("jarvis-export.json");
    expect(exp.json().conversations.length).toBeGreaterThan(0);
  });

  it("TTS sem configuração responde 503 (app usa a voz do iPhone)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/tts", headers: auth(), payload: { text: "olá" } });
    expect(res.statusCode).toBe(503);
  });
});

describe("ElevenLabs", () => {
  it("envia a requisição correta e devolve o áudio", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    const t = new ElevenLabsTts({ apiKey: "k", voiceId: "voz", modelId: "eleven_flash_v2_5" }, fakeFetch);
    const out = await t.synthesize("Olá");
    expect(out.audio.length).toBe(3);
    expect(seen!.url).toContain("/v1/text-to-speech/voz");
    expect((seen!.init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
    expect(JSON.parse(String(seen!.init.body)).voice_settings).toBeUndefined();
  });

  it("usa a voz e a velocidade escolhidas pelo usuário", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;
    const t = new ElevenLabsTts({ apiKey: "k", voiceId: "padrao", modelId: "eleven_flash_v2_5" }, fakeFetch);
    await t.synthesize("Olá", { voiceId: "tgdUjOYNdMYKFLKpkiG6", speed: 1.15 });
    expect(seen!.url).toContain("/v1/text-to-speech/tgdUjOYNdMYKFLKpkiG6");
    expect(JSON.parse(String(seen!.init.body)).voice_settings).toEqual({ speed: 1.15 });
  });
});
