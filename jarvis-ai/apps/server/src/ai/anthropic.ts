/**
 * Provedor Claude (Anthropic) via SDK oficial `@anthropic-ai/sdk`.
 *
 * - Modelo configurável (AI_MODEL), padrão `claude-opus-5-5`.
 * - Esforço configurável (AI_EFFORT), padrão `low`: respostas curtas de conversa
 *   por voz não precisam de raciocínio profundo, e isso reduz custo e latência.
 * - Fallback no servidor (`fallbacks: "default"`): se o modelo recusar por política,
 *   a própria API tenta o modelo substituto recomendado. Desligue com AI_FALLBACKS=false.
 * - Cache de prompt nas instruções estáveis (ferramentas + sistema).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompletionOptions, CompletionRequest, CompletionResult, ModelPart, ModelTurn } from "./types";

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  fallbacks: boolean;
}

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

export function toAnthropicMessages(turns: ModelTurn[]): BetaMessageParam[] {
  return turns.map((turn): BetaMessageParam => {
    if (turn.role === "assistant" && turn.raw) {
      // Conteúdo original devolvido pela API, sem alterações.
      return { role: "assistant", content: turn.raw as BetaContentBlockParam[] };
    }
    const content: BetaContentBlockParam[] = turn.parts.map((p): BetaContentBlockParam => {
      switch (p.type) {
        case "text":
          return { type: "text", text: p.text };
        case "tool_call":
          return { type: "tool_use", id: p.id, name: p.name, input: p.input as Record<string, unknown> };
        case "tool_result":
          return { type: "tool_result", tool_use_id: p.callId, content: p.content, is_error: p.isError ?? false };
      }
    });
    return { role: turn.role, content };
  });
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic | null;

  constructor(private readonly opts: AnthropicProviderOptions) {
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 2, timeout: 60_000 }) : null;
  }

  get model() {
    return this.opts.model;
  }
  get configured() {
    return this.client !== null;
  }

  async complete(req: CompletionRequest, opts: CompletionOptions = {}): Promise<CompletionResult> {
    if (!this.client) throw new Error("ANTHROPIC_API_KEY não configurada no backend.");
    const streaming = Boolean(opts.onText);

    const params = {
      model: req.model ?? this.opts.model,
      max_tokens: req.maxTokens ?? 16000,
      output_config: { effort: this.opts.effort },
      ...(this.opts.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [
        { type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } },
        ...(req.context ? [{ type: "text" as const, text: req.context }] : []),
      ],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
        // Em streaming, a entrada da ferramenta chega sem buffer; o orquestrador valida
        // TODA entrada com zod antes de executar e não executa em max_tokens/recusa.
        ...(streaming ? { eager_input_streaming: true } : {}),
      })),
      messages: toAnthropicMessages(req.turns),
    };

    let response: Anthropic.Beta.Messages.BetaMessage;
    if (streaming) {
      try {
        const stream = this.client.beta.messages.stream(params);
        stream.on("text", (delta) => opts.onText!(delta));
        response = await stream.finalMessage();
      } catch (err) {
        // Erros de API (limite, autenticação...) sobem; só um JSON de ferramenta ilegível
        // no streaming cai para uma chamada normal (sem streaming).
        if (err instanceof Anthropic.APIError) throw err;
        response = await this.client.beta.messages.create({ ...params, tools: params.tools.map(({ eager_input_streaming: _e, ...t }) => t) });
      }
    } else {
      response = await this.client.beta.messages.create(params);
    }

    const parts: ModelPart[] = [];
    for (const block of response.content) {
      if (block.type === "text") parts.push({ type: "text", text: block.text });
      else if (block.type === "tool_use") parts.push({ type: "tool_call", id: block.id, name: block.name, input: block.input });
    }

    const stopReason: CompletionResult["stopReason"] =
      response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence"
        ? "end"
        : response.stop_reason === "tool_use"
          ? "tool_use"
          : response.stop_reason === "max_tokens"
            ? "max_tokens"
            : response.stop_reason === "refusal"
              ? "refusal"
              : response.stop_reason === "pause_turn"
                ? "pause"
                : "other";

    return {
      parts,
      raw: response.content,
      stopReason,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
