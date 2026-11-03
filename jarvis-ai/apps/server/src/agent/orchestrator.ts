/**
 * AI Orchestrator — laço de agente com ferramentas reais.
 *
 * 1. Interpreta a intenção (modelo) e escolhe ferramentas.
 * 2. Valida a entrada de cada ferramenta com zod antes de executar.
 * 3. Ferramentas de risco "confirm" viram AÇÕES PENDENTES — nada é executado
 *    até o usuário confirmar no app (POST /v1/actions/:id/confirm).
 * 4. Registra auditoria e consumo; aplica o limite diário de custo.
 * 5. Nunca declara sucesso sem resultado positivo da ferramenta.
 */
import type { ChatMessage, ChatResponse, Profile, ToolEvent } from "@jarvis/shared";
import { AppError } from "../errors";
import type { AIProvider, ModelPart, ModelTurn } from "../ai/types";
import { estimateCostUsd } from "../ai/pricing";
import type { ToolRegistry, ToolContext } from "../tools/registry";
import type { PendingActionRecord, UserStore } from "../store/types";
import { buildContext, SYSTEM_PROMPT } from "./prompt";
import { toSpeech } from "./speech";
import { isValidTimezone, startOfDayInTimezone } from "./time";

export interface OrchestratorDeps {
  provider: AIProvider;
  registry: ToolRegistry;
  maxToolIterations: number;
  historyMessages: number;
  clock?: () => Date;
  log?: { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void };
}

export interface TurnInput {
  message: string;
  conversationId?: string;
  inputMode: "voice" | "text";
  timezone?: string;
}

const REFUSAL_REPLY = "Desculpe, não posso ajudar com esse pedido.";

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  private now() {
    return this.deps.clock?.() ?? new Date();
  }

  /** Garante que o custo do dia ainda está abaixo do limite configurado. */
  async assertWithinBudget(store: UserStore, profile: Profile): Promise<void> {
    if (profile.dailyCostLimitUsd <= 0) {
      throw new AppError("limite_diario", 429, "O limite diário de custo está em zero. Ajuste em Configurações.");
    }
    const spent = await store.usageSince(startOfDayInTimezone(this.now(), profile.timezone));
    if (spent.costUsd >= profile.dailyCostLimitUsd) {
      throw new AppError(
        "limite_diario",
        429,
        `Limite diário de custo atingido (US$ ${spent.costUsd.toFixed(2)} de US$ ${profile.dailyCostLimitUsd.toFixed(2)}). Ajuste em Configurações ou tente amanhã.`,
      );
    }
  }

  async runTurn(store: UserStore, input: TurnInput): Promise<ChatResponse> {
    const { provider, registry } = this.deps;
    if (!provider.configured) {
      throw new AppError("ia_nao_configurada", 503, "A chave da IA não está configurada no backend (ANTHROPIC_API_KEY).");
    }

    let profile = await store.getProfile();
    if (input.timezone && isValidTimezone(input.timezone) && input.timezone !== profile.timezone) {
      profile = await store.updateProfile({ timezone: input.timezone });
    }
    await this.assertWithinBudget(store, profile);

    // Conversa
    let conversation = input.conversationId ? await store.getConversation(input.conversationId) : null;
    if (input.conversationId && !conversation) throw new AppError("nao_encontrado", 404, "Conversa não encontrada.");
    if (!conversation) conversation = await store.createConversation(titleFrom(input.message));

    const history = await store.listMessages(conversation.id, this.deps.historyMessages);
    await store.addMessage({ conversationId: conversation.id, role: "user", content: input.message, inputMode: input.inputMode });

    const now = this.now();
    const relevant = profile.memoryEnabled ? await store.listMemories({ query: input.message, limit: 5 }) : [];
    const context = buildContext(profile, now, relevant);
    const toolCtx: ToolContext = { store, profile, conversationId: conversation.id, now };

    const turns: ModelTurn[] = historyToTurns(history);
    turns.push({ role: "user", parts: [{ type: "text", text: input.message }] });

    const toolEvents: ToolEvent[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
    let finalText = "";
    let answeredBy = provider.model;

    for (let iteration = 0; ; iteration++) {
      if (iteration >= this.deps.maxToolIterations) {
        finalText = "Precisei de mais etapas do que o permitido para concluir esse pedido e parei por segurança. Pode reformular ou dividir em partes?";
        break;
      }

      const result = await provider.complete({ system: SYSTEM_PROMPT, context, turns, tools: registry.specs() });
      answeredBy = result.model;
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.cacheReadTokens += result.usage.cacheReadTokens;
      usage.cacheWriteTokens += result.usage.cacheWriteTokens;
      usage.costUsd += estimateCostUsd(result.model, result.usage);

      if (result.stopReason === "refusal") {
        finalText = REFUSAL_REPLY;
        break;
      }

      const text = result.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n").trim();
      const calls = result.parts.filter((p): p is Extract<ModelPart, { type: "tool_call" }> => p.type === "tool_call");

      if (result.stopReason === "pause") {
        turns.push({ role: "assistant", parts: result.parts, raw: result.raw });
        continue;
      }

      if (result.stopReason !== "tool_use" || calls.length === 0) {
        finalText = text || (result.stopReason === "max_tokens" ? "A resposta ficou longa demais e foi interrompida." : "");
        break;
      }

      turns.push({ role: "assistant", parts: result.parts, raw: result.raw });
      // Todos os resultados de ferramentas voltam numa única mensagem do usuário.
      const results: ModelPart[] = [];
      for (const call of calls) {
        const { part, event } = await this.runTool(call, toolCtx);
        results.push(part);
        if (event) toolEvents.push(event);
      }
      turns.push({ role: "user", parts: results });
    }

    if (!finalText) finalText = "Não consegui formular uma resposta. Pode repetir, por favor?";

    const reply: ChatMessage = await store.addMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: finalText,
      toolEvents,
    });
    await store.touchConversation(conversation.id);
    await store.recordUsage({
      kind: "chat",
      provider: provider.name,
      model: answeredBy,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      costUsd: usage.costUsd,
    });
    this.deps.log?.info(
      { conversationId: conversation.id, tools: toolEvents.map((e) => `${e.tool}:${e.status}`), ...usage, model: answeredBy },
      "turno concluído",
    );

    return {
      conversationId: conversation.id,
      reply,
      speech: toSpeech(finalText),
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd },
    };
  }

  private async runTool(
    call: Extract<ModelPart, { type: "tool_call" }>,
    ctx: ToolContext,
  ): Promise<{ part: ModelPart; event?: ToolEvent }> {
    const tool = this.deps.registry.get(call.name);
    if (!tool) {
      await ctx.store.logAction({ tool: call.name, status: "blocked", summary: "Ferramenta inexistente solicitada pelo modelo" });
      return { part: { type: "tool_result", callId: call.id, content: `Ferramenta "${call.name}" não existe.`, isError: true } };
    }

    const parsed = tool.input.safeParse(call.input ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");
      return { part: { type: "tool_result", callId: call.id, content: `Entrada inválida: ${issues}`, isError: true } };
    }

    if (tool.risk === "confirm") {
      const summary = await tool.describe!(parsed.data, ctx);
      const pending = await ctx.store.createPendingAction({ conversationId: ctx.conversationId, tool: tool.name, input: parsed.data, summary });
      await ctx.store.logAction({ tool: tool.name, status: "pending", summary, input: parsed.data });
      return {
        part: {
          type: "tool_result",
          callId: call.id,
          content:
            `AÇÃO NÃO EXECUTADA — aguardando confirmação explícita do usuário no aplicativo (pedido ${pending.id}). ` +
            `Diga ao usuário exatamente o que será feito ("${summary}") e que ele pode confirmar ou cancelar no cartão exibido.`,
        },
        event: { tool: tool.name, label: tool.label, status: "pending", summary, pendingActionId: pending.id },
      };
    }

    try {
      const outcome = await tool.execute(parsed.data, ctx);
      const status = outcome.isError ? "failed" : "executed";
      if (tool.risk === "write" || outcome.isError) {
        await ctx.store.logAction({ tool: tool.name, status, summary: outcome.summary, input: parsed.data });
      }
      return {
        part: { type: "tool_result", callId: call.id, content: outcome.content, isError: outcome.isError },
        event: { tool: tool.name, label: tool.label, status, summary: outcome.summary },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log?.warn({ tool: tool.name, err: message }, "falha na ferramenta");
      await ctx.store.logAction({ tool: tool.name, status: "failed", summary: `Erro: ${message.slice(0, 200)}` });
      return {
        part: { type: "tool_result", callId: call.id, content: `A ferramenta falhou: ${message}. Nada foi concluído.`, isError: true },
        event: { tool: tool.name, label: tool.label, status: "failed", summary: "Falhou — nada foi concluído" },
      };
    }
  }

  /** Executa uma ação pendente após confirmação explícita do usuário. */
  async confirmAction(store: UserStore, id: string): Promise<{ action: PendingActionRecord; message: string }> {
    const pending = await this.loadPending(store, id);
    const tool = this.deps.registry.get(pending.tool);
    if (!tool) throw new AppError("ferramenta_indisponivel", 409, "Esta ação não está mais disponível.");
    const parsed = tool.input.safeParse(pending.input);
    if (!parsed.success) throw new AppError("entrada_invalida", 409, "Os dados desta ação são inválidos; ela não foi executada.");

    const profile = await store.getProfile();
    try {
      const outcome = await tool.execute(parsed.data, { store, profile, conversationId: pending.conversationId, now: this.now() });
      const status = outcome.isError ? "failed" : "confirmed";
      const action = await store.resolvePendingAction(id, status, { summary: outcome.summary });
      await store.logAction({ tool: tool.name, status, summary: outcome.summary, input: parsed.data });
      const message = outcome.isError ? `Não foi possível concluir: ${outcome.summary}.` : `Feito: ${outcome.summary}.`;
      if (pending.conversationId) {
        await store.addMessage({
          conversationId: pending.conversationId,
          role: "assistant",
          content: message,
          toolEvents: [{ tool: tool.name, label: tool.label, status: outcome.isError ? "failed" : "executed", summary: outcome.summary }],
        });
      }
      return { action, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const action = await store.resolvePendingAction(id, "failed", { error: message });
      await store.logAction({ tool: tool.name, status: "failed", summary: `Erro: ${message.slice(0, 200)}` });
      return { action, message: "A ação falhou e não foi concluída." };
    }
  }

  async rejectAction(store: UserStore, id: string): Promise<{ action: PendingActionRecord; message: string }> {
    const pending = await this.loadPending(store, id);
    const action = await store.resolvePendingAction(id, "rejected");
    await store.logAction({ tool: pending.tool, status: "rejected", summary: `Cancelado pelo usuário: ${pending.summary}` });
    if (pending.conversationId) {
      await store.addMessage({
        conversationId: pending.conversationId,
        role: "assistant",
        content: "Entendido, ação cancelada. Nada foi alterado.",
        toolEvents: [{ tool: pending.tool, label: "Ação cancelada", status: "rejected", summary: pending.summary }],
      });
    }
    return { action, message: "Ação cancelada. Nada foi alterado." };
  }

  private async loadPending(store: UserStore, id: string): Promise<PendingActionRecord> {
    const pending = await store.getPendingAction(id);
    if (!pending) throw new AppError("nao_encontrado", 404, "Ação não encontrada.");
    if (pending.status !== "pending") throw new AppError("acao_resolvida", 409, `Esta ação já foi ${statusLabel(pending.status)}.`);
    if (new Date(pending.expiresAt).getTime() < this.now().getTime()) {
      await store.resolvePendingAction(id, "expired");
      throw new AppError("acao_expirada", 410, "Esta ação expirou. Peça novamente ao Jarvis.");
    }
    return pending;
  }
}

function statusLabel(s: PendingActionRecord["status"]) {
  return { pending: "registrada", confirmed: "confirmada", rejected: "cancelada", expired: "expirada", failed: "tentada e falhou" }[s];
}

export function titleFrom(message: string): string {
  const clean = message.replace(/^\s*(ok\s+)?jarvis[,!.\s]*/i, "").trim() || message.trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/** Histórico salvo (texto) → turnos do modelo. Garante alternância começando por "user". */
export function historyToTurns(history: ChatMessage[]): ModelTurn[] {
  const turns: ModelTurn[] = [];
  for (const m of history) {
    const text = m.content.trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) {
      last.parts.push({ type: "text", text });
    } else {
      turns.push({ role: m.role, parts: [{ type: "text", text }] });
    }
  }
  while (turns.length > 0 && turns[0]!.role !== "user") turns.shift();
  // O turno atual do usuário será anexado; evita dois "user" seguidos.
  if (turns.length > 0 && turns[turns.length - 1]!.role === "user") turns.pop();
  return turns;
}
