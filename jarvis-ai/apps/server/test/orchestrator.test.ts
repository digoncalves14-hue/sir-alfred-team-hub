import { describe, expect, it } from "vitest";
import { Orchestrator, historyToTurns, titleFrom } from "../src/agent/orchestrator";
import { createDefaultRegistry } from "../src/tools/builtin";
import { MemoryUserStore } from "../src/store/memory-store";
import { AppError } from "../src/errors";
import { ScriptedProvider, call, text } from "./fake-provider";

const USER = "11111111-1111-4111-8111-111111111111";

function setup(steps: ConstructorParameters<typeof ScriptedProvider>[0], configured = true) {
  const provider = new ScriptedProvider(steps, configured);
  const orchestrator = new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 4, historyMessages: 20 });
  const store = new MemoryUserStore(USER);
  return { provider, orchestrator, store };
}

describe("Orchestrator", () => {
  it("responde e persiste a conversa", async () => {
    const { orchestrator, store, provider } = setup([text("Bom dia, **senhor**. Tudo pronto.")]);
    const res = await orchestrator.runTurn(store, { message: "Jarvis, bom dia", inputMode: "voice" });

    expect(res.reply.content).toBe("Bom dia, **senhor**. Tudo pronto.");
    expect(res.speech).toBe("Bom dia, senhor. Tudo pronto."); // sem markdown para a fala
    const msgs = await store.listMessages(res.conversationId, 10);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect((await store.getConversation(res.conversationId))?.title).toBe("bom dia");
    // contexto inclui hora e forma de tratamento, separado das instruções estáveis
    expect(provider.requests[0]!.context).toContain('Trate o proprietário por: "senhor"');
    expect(provider.requests[0]!.system).not.toContain("Data e hora atuais");
    expect(res.usage.costUsd).toBeGreaterThan(0);
  });

  it("usa histórico da conversa nas mensagens seguintes", async () => {
    const { orchestrator, store, provider } = setup([text("Primeira."), text("Segunda.")]);
    const first = await orchestrator.runTurn(store, { message: "um", inputMode: "text" });
    await orchestrator.runTurn(store, { message: "dois", inputMode: "text", conversationId: first.conversationId });
    const turns = provider.requests[1]!.turns;
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
  });

  it("executa salvar_memoria de verdade e informa o evento", async () => {
    const { orchestrator, store } = setup([
      call("salvar_memoria", { content: "Decidimos lançar a pomada matte da Black Bear em março.", category: "decisao", space: "black_bear" }),
      text("Anotado, senhor."),
    ]);
    const res = await orchestrator.runTurn(store, { message: "lembre que decidimos lançar a pomada em março", inputMode: "voice" });
    expect(res.reply.toolEvents).toHaveLength(1);
    expect(res.reply.toolEvents[0]).toMatchObject({ tool: "salvar_memoria", status: "executed" });
    const mems = await store.listMemories({ space: "black_bear" });
    expect(mems).toHaveLength(1);
    expect(mems[0]!.category).toBe("decisao");
    expect((await store.listAudit(10))[0]).toMatchObject({ tool: "salvar_memoria", status: "executed" });
  });

  it("encontra a última decisão sobre a Black Bear (busca sem acento) e devolve como dado externo", async () => {
    const { orchestrator, store, provider } = setup([
      call("buscar_memoria", { query: "decisão Black Bear", space: "black_bear" }),
      text("A última decisão foi lançar a pomada em março."),
    ]);
    await store.createMemory({ content: "Decisao: lançar pomada matte da Black Bear em março.", category: "decisao", space: "black_bear", source: "user" });
    await store.createMemory({ content: "Prefiro reuniões pela manhã.", category: "preferencia", space: "pessoal", source: "user" });
    await orchestrator.runTurn(store, { message: "Qual foi nossa última decisão sobre a Black Bear?", inputMode: "voice" });

    const toolResult = provider.requests[1]!.turns.at(-1)!.parts[0]!;
    expect(toolResult.type).toBe("tool_result");
    if (toolResult.type !== "tool_result") throw new Error();
    expect(toolResult.content).toContain("<dados_externos");
    expect(toolResult.content).toContain("pomada matte");
    expect(toolResult.content).not.toContain("reuniões pela manhã");
  });

  it("informa quando não há memória (não inventa)", async () => {
    const { orchestrator, store, provider } = setup([call("buscar_memoria", { query: "Barton preço" }), text("Não encontrei registro.")]);
    await orchestrator.runTurn(store, { message: "qual o preço do Barton?", inputMode: "text" });
    const r = provider.requests[1]!.turns.at(-1)!.parts[0]!;
    expect(r.type === "tool_result" && r.content).toContain("Nenhuma memória encontrada");
  });

  it("exclusão vira ação PENDENTE e só acontece após confirmação", async () => {
    const { orchestrator, store, provider } = setup([]);
    const mem = await store.createMemory({ content: "Senha do wifi é antiga", category: "outro", space: "pessoal", source: "user" });
    (provider as unknown as { steps: unknown[] }).steps = [call("apagar_memoria", { id: mem.id }), text("Posso apagar? Confirme no cartão.")];

    const res = await orchestrator.runTurn(store, { message: "apague a memória do wifi", inputMode: "voice" });
    const ev = res.reply.toolEvents[0]!;
    expect(ev.status).toBe("pending");
    expect(ev.pendingActionId).toBeDefined();
    expect(await store.getMemory(mem.id)).not.toBeNull(); // ainda existe!
    const toolResult = provider.requests[1]!.turns.at(-1)!.parts[0]!;
    expect(toolResult.type === "tool_result" && toolResult.content).toContain("AÇÃO NÃO EXECUTADA");

    const confirmed = await orchestrator.confirmAction(store, ev.pendingActionId!);
    expect(confirmed.action.status).toBe("confirmed");
    expect(await store.getMemory(mem.id)).toBeNull();
    await expect(orchestrator.confirmAction(store, ev.pendingActionId!)).rejects.toMatchObject({ code: "acao_resolvida" });
  });

  it("cancelar uma ação pendente não altera nada", async () => {
    const { orchestrator, store, provider } = setup([]);
    const mem = await store.createMemory({ content: "Reunião semanal às segundas", category: "compromisso", space: "pessoal", source: "user" });
    (provider as unknown as { steps: unknown[] }).steps = [call("apagar_memoria", { id: mem.id }), text("Confirme.")];
    const res = await orchestrator.runTurn(store, { message: "apague", inputMode: "text" });
    const r = await orchestrator.rejectAction(store, res.reply.toolEvents[0]!.pendingActionId!);
    expect(r.action.status).toBe("rejected");
    expect(await store.getMemory(mem.id)).not.toBeNull();
  });

  it("ação pendente expirada não é executada", async () => {
    let now = new Date("2026-11-03T12:00:00Z");
    const provider = new ScriptedProvider([]);
    const orchestrator = new Orchestrator({ provider, registry: createDefaultRegistry(), maxToolIterations: 4, historyMessages: 20, clock: () => now });
    const store = new MemoryUserStore(USER);
    const mem = await store.createMemory({ content: "algo antigo", category: "outro", space: "pessoal", source: "user" });
    const pending = await store.createPendingAction({ conversationId: null, tool: "apagar_memoria", input: { id: mem.id }, summary: "Apagar" });
    now = new Date(new Date(pending.expiresAt).getTime() + 1000);
    await expect(orchestrator.confirmAction(store, pending.id)).rejects.toMatchObject({ code: "acao_expirada" });
    expect(await store.getMemory(mem.id)).not.toBeNull();
  });

  it("bloqueia dados sensíveis na memória", async () => {
    const { orchestrator, store } = setup([
      call("salvar_memoria", { content: "Minha senha do banco: abc123", category: "outro", space: "pessoal" }),
      text("Não posso guardar senhas."),
    ]);
    const res = await orchestrator.runTurn(store, { message: "guarde minha senha do banco abc123", inputMode: "text" });
    expect(res.reply.toolEvents[0]).toMatchObject({ status: "failed" });
    expect(await store.listMemories({})).toHaveLength(0);
    expect((await store.listAudit(10)).some((a) => a.status === "blocked")).toBe(true);
  });

  it("respeita memória desativada", async () => {
    const { orchestrator, store } = setup([
      call("salvar_memoria", { content: "Gosto de café sem açúcar", category: "preferencia" }),
      text("A memória está desligada."),
    ]);
    await store.updateProfile({ memoryEnabled: false });
    await orchestrator.runTurn(store, { message: "lembre que gosto de café sem açúcar", inputMode: "text" });
    expect(await store.listMemories({})).toHaveLength(0);
  });

  it("rejeita entrada inválida de ferramenta e ferramenta inexistente sem executar", async () => {
    const { orchestrator, store, provider } = setup([
      () => ({
        parts: [
          { type: "tool_call", id: "a", name: "apagar_memoria", input: { id: "nao-e-uuid" } },
          { type: "tool_call", id: "b", name: "enviar_pix", input: { valor: 1000 } },
        ],
      }),
      text("Não consegui."),
    ]);
    const res = await orchestrator.runTurn(store, { message: "faça um pix", inputMode: "text" });
    const results = provider.requests[1]!.turns.at(-1)!.parts;
    expect(results).toHaveLength(2); // todos os resultados numa única mensagem
    expect(results.every((p) => p.type === "tool_result" && p.isError)).toBe(true);
    expect(res.reply.toolEvents).toHaveLength(0);
    expect(await store.listPendingActions()).toHaveLength(0);
  });

  it("interrompe laços longos de ferramentas", async () => {
    const steps = Array.from({ length: 10 }, (_, i) => call("obter_data_hora", {}, `c${i}`));
    const { orchestrator, store } = setup(steps);
    const res = await orchestrator.runTurn(store, { message: "que horas são", inputMode: "text" });
    expect(res.reply.content).toContain("parei por segurança");
  });

  it("trata recusa do modelo com resposta honesta", async () => {
    const { orchestrator, store } = setup([() => ({ parts: [], stopReason: "refusal" })]);
    const res = await orchestrator.runTurn(store, { message: "x", inputMode: "text" });
    expect(res.reply.content).toContain("não posso ajudar");
  });

  it("aplica o limite diário de custo", async () => {
    const { orchestrator, store } = setup([text("ok")]);
    await store.updateProfile({ dailyCostLimitUsd: 0.05 });
    await store.recordUsage({ kind: "chat", provider: "fake", model: "x", costUsd: 0.06 });
    await expect(orchestrator.runTurn(store, { message: "oi", inputMode: "text" })).rejects.toBeInstanceOf(AppError);
  });

  it("retorna 503 quando a IA não está configurada", async () => {
    const { orchestrator, store } = setup([], false);
    await expect(orchestrator.runTurn(store, { message: "oi", inputMode: "text" })).rejects.toMatchObject({ statusCode: 503 });
  });

  it("atualiza o fuso horário informado pelo aparelho", async () => {
    const { orchestrator, store } = setup([text("ok")]);
    await orchestrator.runTurn(store, { message: "oi", inputMode: "text", timezone: "America/Manaus" });
    expect((await store.getProfile()).timezone).toBe("America/Manaus");
  });
});

describe("helpers", () => {
  it("titleFrom remove a palavra de ativação", () => {
    expect(titleFrom("Jarvis, marque uma reunião amanhã")).toBe("marque uma reunião amanhã");
  });
  it("historyToTurns agrupa e garante alternância", () => {
    const mk = (role: "user" | "assistant", content: string) => ({ id: content, role, content, toolEvents: [], createdAt: "" });
    const turns = historyToTurns([mk("assistant", "a0"), mk("user", "u1"), mk("user", "u2"), mk("assistant", "a1"), mk("user", "u3")]);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(turns[0]!.parts).toHaveLength(2);
  });
});
