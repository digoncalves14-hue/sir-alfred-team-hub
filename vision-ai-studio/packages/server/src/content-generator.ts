import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ContentSuggestionsSchema, type ContentSuggestions } from "@vision/core";
import { getConfig } from "./config";
import { estimateAiCost } from "./costs";
import { ProcessingError } from "./errors";

export interface ContentInput {
  projectName: string;
  brand: { name: string; segment: string; tone: string; contentTypes: string[] } | null;
  destinations: string[];
  durationSec: number;
  /** Fala do vídeo final (já cortado), quando há transcrição. */
  transcript: string | null;
  editSummary: string[];
  frames: Array<{ outputTime: number; jpegBase64: string }>;
}

const SYSTEM = `Você é redator de redes sociais do VISION AI STUDIO. Escreva em português do Brasil textos para publicar um vídeo.
Regras: baseie-se SOMENTE no conteúdo fornecido (transcrição, quadros, resumo da edição e marca). Não invente fatos, preços, promoções, nomes ou resultados que não aparecem no material.
Respeite o tom da marca. Sem promessas de viralização. Hashtags relevantes ao conteúdo e ao segmento, sem hashtags genéricas de engajamento.`;

function schema(): Record<string, unknown> {
  const raw = zodToJsonSchema(ContentSuggestionsSchema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  const clean = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(clean);
    if (!n || typeof n !== "object") return n;
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) if (k !== "$schema" && k !== "default") o[k] = clean(v);
    if (o.type === "object") o.additionalProperties = false;
    return o;
  };
  return clean(raw) as Record<string, unknown>;
}

export function buildContentPrompt(input: ContentInput): string {
  return JSON.stringify({
    projeto: input.projectName,
    marca: input.brand,
    destinos: input.destinations,
    duracao_segundos: Math.round(input.durationSec),
    resumo_da_edicao: input.editSummary.slice(-8),
    fala_do_video: input.transcript ? input.transcript.slice(0, 12000) : "(sem transcrição disponível — use apenas os quadros e o resumo)",
    quadros_fornecidos: input.frames.map((f) => f.outputTime),
  });
}

/** Gera sugestões de textos com Claude (saída estruturada). Exige ANTHROPIC_API_KEY. */
export async function generateContent(input: ContentInput): Promise<{ data: ContentSuggestions; model: string; costUsd: number }> {
  const c = getConfig();
  if (c.aiProvider !== "anthropic" || !c.ANTHROPIC_API_KEY) {
    throw new ProcessingError("ai_not_configured", "A geração de textos requer um provedor de IA configurado (ANTHROPIC_API_KEY).");
  }
  const client = new Anthropic({ apiKey: c.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of input.frames) {
    content.push({ type: "text", text: `Quadro em t=${f.outputTime}s:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.jpegBase64 } });
  }
  content.push({ type: "text", text: `Material do vídeo (JSON):\n${buildContentPrompt(input)}` });
  try {
    const r = await client.beta.messages.create({
      model: c.AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: schema() } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const cost = estimateAiCost(
      (r.usage.input_tokens ?? 0) + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0),
      r.usage.output_tokens ?? 0,
    );
    if (r.stop_reason === "refusal") throw new ProcessingError("ai_refused", "O modelo recusou gerar textos para este conteúdo.");
    const text = r.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    return { data: ContentSuggestionsSchema.parse(JSON.parse(text)), model: r.model, costUsd: cost };
  } catch (err) {
    if (err instanceof ProcessingError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new ProcessingError("ai_rate_limit", "Limite de uso da IA atingido; tente novamente em instantes.", true);
    if (err instanceof Anthropic.AuthenticationError) throw new ProcessingError("ai_auth", "A chave da API de IA é inválida.");
    if (err instanceof Anthropic.APIError) throw new ProcessingError("ai_api", `Serviço de IA indisponível (${err.status ?? "erro"}).`, true);
    throw new ProcessingError("ai_invalid", "A IA retornou um resultado inválido.", true, (err as Error).message);
  }
}
