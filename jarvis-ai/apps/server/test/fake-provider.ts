import type { AIProvider, CompletionRequest, CompletionResult, ModelPart } from "../src/ai/types";

type Step = (req: CompletionRequest) => Partial<CompletionResult> & { parts: ModelPart[] };

/** Provedor roteirizado para testes: cada chamada consome o próximo passo. */
export class ScriptedProvider implements AIProvider {
  readonly name = "fake";
  readonly model = "claude-opus-5-5";
  readonly configured: boolean;
  readonly requests: CompletionRequest[] = [];
  private steps: Step[];

  constructor(steps: Step[], configured = true) {
    this.steps = [...steps];
    this.configured = configured;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // Cópia profunda: o orquestrador continua mutando o array de turnos.
    this.requests.push(structuredClone(req));
    const step = this.steps.shift();
    if (!step) throw new Error("ScriptedProvider: nenhum passo restante");
    const out = step(req);
    const hasCalls = out.parts.some((p) => p.type === "tool_call");
    return {
      raw: out.parts,
      stopReason: out.stopReason ?? (hasCalls ? "tool_use" : "end"),
      usage: out.usage ?? { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model: out.model ?? this.model,
      parts: out.parts,
    };
  }
}

export const text = (t: string): Step => () => ({ parts: [{ type: "text", text: t }] });
export const call = (name: string, input: unknown, id = `call_${name}`): Step => () => ({
  parts: [{ type: "tool_call", id, name, input }],
});
