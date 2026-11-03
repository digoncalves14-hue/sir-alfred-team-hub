/**
 * Interface neutra de provedor de IA. O orquestrador depende apenas disto,
 * então outro provedor pode ser adicionado implementando `AIProvider`.
 */

export type ModelPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; callId: string; content: string; isError?: boolean };

export interface ModelTurn {
  role: "user" | "assistant";
  parts: ModelPart[];
  /**
   * Conteúdo nativo do provedor para turnos do assistente gerados no laço atual.
   * Deve ser reenviado sem alterações (preserva blocos de raciocínio).
   */
  raw?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  /** Instruções estáveis (cacheáveis). */
  system: string;
  /** Contexto variável do turno (data/hora, memórias relevantes). */
  context: string;
  turns: ModelTurn[];
  tools: ToolSpec[];
  /** Substitui o modelo padrão nesta chamada (ex.: modo econômico, resumos). */
  model?: string;
  maxTokens?: number;
}

export interface CompletionOptions {
  /** Recebe o texto conforme é gerado (streaming). */
  onText?: (delta: string) => void;
}

export interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CompletionResult {
  parts: ModelPart[];
  raw: unknown;
  stopReason: "end" | "tool_use" | "max_tokens" | "refusal" | "pause" | "other";
  usage: CompletionUsage;
  /** Modelo que efetivamente respondeu (pode ser um fallback). */
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly configured: boolean;
  complete(req: CompletionRequest, opts?: CompletionOptions): Promise<CompletionResult>;
}
