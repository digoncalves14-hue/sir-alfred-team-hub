import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  type BrandContext,
  type EditPlan,
  EditOperation,
  EditPlanEnvelopeSchema,
  EDIT_STYLES,
  FORMAT_PRESETS,
  CAPTION_STYLES,
  type SourceMap,
  type Timeline,
  averageTrack,
  clipsDuration,
  parseCommandLocally,
  planFromEnvelope,
  placeClips,
  round3,
  timelineDuration,
} from "@vision/core";
import { getConfig } from "./config";
import { estimateAiCost } from "./costs";
import { log } from "./logger";

export interface PlannerFrame {
  outputTime: number;
  jpegBase64: string;
}

export interface PlannerInput {
  command: string;
  timeline: Timeline;
  sources: SourceMap;
  brand: (BrandContext & { segment: string; tone: string }) | null;
  musicAssets: Array<{ id: string; name: string }>;
  frames: PlannerFrame[];
  history: Array<{ text: string; reply: string | null }>;
  /** Orientação do template aplicado ao projeto (estrutura narrativa). */
  templateGuidance?: string | null;
}

export interface PlannerOutput {
  plan: EditPlan;
  engine: "anthropic" | "local-rules";
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  fallbackReason?: string;
}

export const SYSTEM_PROMPT = `Você é o editor de vídeo do VISION AI STUDIO. Converte pedidos em português do Brasil em um PLANO DE EDIÇÃO estruturado (JSON), que um motor determinístico executa com FFmpeg. Você nunca escreve comandos FFmpeg.

Regras:
- Todos os tempos (start/end) referem-se ao VÍDEO FINAL ATUAL (a versão descrita no contexto), em segundos.
- Para "versão de X segundos", use target_duration (best_moments por padrão; speech_focused para conteúdo falado; beginning só se o usuário pedir para manter o começo).
- Use remove_silences para pausas/silêncios e remove_static para "momentos em que nada acontece".
- set_captions só funciona se houver transcrição (indicado no contexto). Sem transcrição, ainda inclua set_captions — o sistema transcreve antes se o serviço estiver disponível.
- add_logo usa SOMENTE a logo oficial da marca; nunca descreva ou crie outra logo.
- set_music só com músicas listadas no contexto (asset_id) ou null para a música da marca. Não afirme que uma música é livre de direitos.
- zoom_range: use para "aproxime a câmera" quando os QUADROS fornecidos mostrarem claramente o momento pedido; use os instantes dos quadros para estimar o trecho. Se não houver quadros ou não for possível identificar, use "unsupported" explicando.
- Nunca afirme ter visto ou reconhecido algo que não está nos quadros, na transcrição ou na análise técnica fornecidos.
- Pedidos impossíveis nesta versão (transições, efeitos, narração por voz, escolha de música por clima sem biblioteca, publicação em redes sociais) → operação "unsupported" com motivo honesto.
- A ordem das operações importa: aplique cortes (trim/remove/target_duration) antes ou depois conforme o pedido; formatos e legendas podem vir em qualquer ordem.
- "reply": 1 a 3 frases curtas em português do Brasil dizendo o que será feito e o que não foi possível. Não prometa engajamento ou viralização.

Estilos de edição disponíveis (set_style): ${Object.values(EDIT_STYLES)
  .map((s) => `${s.id} = ${s.label}`)
  .join("; ")}.
Estilos de legenda: ${Object.values(CAPTION_STYLES)
  .map((s) => `${s.id} = ${s.label}`)
  .join("; ")}.
Formatos: ${Object.values(FORMAT_PRESETS)
  .map((p) => `${p.id} = ${p.label}`)
  .join("; ")}.

Formato da resposta: cada operação tem "op" (nome) e "args" (texto com um objeto JSON contendo TODOS os campos listados abaixo para essa operação; use null nos campos que aceitam null quando não se aplicarem).
Operações e seus campos:
${operationCatalog()}`;

/** Lista legível dos campos de cada operação (vai no prompt; o schema enviado à API é o envelope compacto). */
function operationCatalog(): string {
  return EditOperation.options
    .map((o) => {
      const schema = zodToJsonSchema(o, { $refStrategy: "none" }) as { properties: Record<string, JsonProp> };
      const fields = Object.entries(schema.properties)
        .filter(([k]) => k !== "op")
        .map(([k, v]) => `${k}: ${describeProp(v)}`);
      return `- ${o.shape.op.value}: ${fields.length ? fields.join("; ") : "sem campos ({})"}`;
    })
    .join("\n");
}

interface JsonProp {
  type?: string | string[];
  enum?: unknown[];
  anyOf?: JsonProp[];
  description?: string;
}

function describeProp(p: JsonProp): string {
  const types = (Array.isArray(p.type) ? p.type : p.type ? [p.type] : []).concat((p.anyOf ?? []).flatMap((a) => (Array.isArray(a.type) ? a.type : a.type ? [a.type] : [])));
  const enums = p.enum ?? p.anyOf?.find((a) => a.enum)?.enum;
  let t = enums ? enums.filter((e) => e !== null).map((e) => JSON.stringify(e)).join(" | ") : types.filter((x) => x !== "null").join(" | ");
  if (types.includes("null") || enums?.includes(null)) t += " | null";
  return p.description ? `${t} (${p.description})` : t;
}

let cachedSchema: Record<string, unknown> | null = null;

/** JSON Schema enviado à API: envelope compacto (op + args em JSON), cada operação validada depois. */
export function editPlanJsonSchema(): Record<string, unknown> {
  if (cachedSchema) return cachedSchema;
  const raw = zodToJsonSchema(EditPlanEnvelopeSchema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
  cachedSchema = sanitizeSchema(raw) as Record<string, unknown>;
  return cachedSchema;
}

function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "$schema" || k === "default") continue;
    if (k === "const") {
      out.enum = [v];
      continue;
    }
    out[k] = sanitizeSchema(v);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

/** Mensagem de erro devolvida pela API de IA (sem dados da requisição nem chaves). */
export function aiErrorDetail(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  const msg = typeof body?.error?.message === "string" ? body.error.message : err.message;
  return msg.slice(0, 300);
}

/** Explicação em português para o usuário, incluindo a causa informada pela API. */
export function describeAiError(err: InstanceType<typeof Anthropic.APIError>): string {
  const detail = aiErrorDetail(err);
  if (/credit balance/i.test(detail)) {
    return "A conta da API de IA está sem créditos — adicione créditos em platform.claude.com (Billing).";
  }
  return `Serviço de IA indisponível (${err.status ?? "erro"}: ${detail}).`;
}

/** Resumo compacto do projeto enviado ao modelo. */
export function buildPlannerContext(input: PlannerInput): string {
  const tl = input.timeline;
  const placed = placeClips(tl);
  const clips = placed.slice(0, 80).map((p) => {
    const src = input.sources.get(p.clip.assetId);
    const act = src?.analysis?.activity;
    const motion = act ? averageTrack(act.motion, act.sampleRate, p.clip.sourceStart, p.clip.sourceEnd) : null;
    const speech = src?.transcript
      ? src.transcript.segments
          .filter((s) => s.end > p.clip.sourceStart && s.start < p.clip.sourceEnd)
          .map((s) => `[${round3(p.outStart + Math.max(0, s.start - p.clip.sourceStart))}s] ${s.text}`)
          .join(" ")
      : null;
    return {
      inicio: p.outStart,
      fim: p.outEnd,
      movimento: motion != null ? round3(motion) : "sem análise",
      zoom: p.clip.zoom,
      fala: speech ? speech.slice(0, 1500) : src?.transcript ? "(sem fala)" : "(sem transcrição)",
    };
  });
  const silences: Array<{ inicio: number; fim: number }> = [];
  for (const p of placed) {
    const a = input.sources.get(p.clip.assetId)?.analysis;
    for (const s of a?.silences ?? []) {
      const st = Math.max(s.start, p.clip.sourceStart);
      const en = Math.min(s.end, p.clip.sourceEnd);
      if (en - st >= 0.6) silences.push({ inicio: round3(p.outStart + st - p.clip.sourceStart), fim: round3(p.outStart + en - p.clip.sourceStart) });
    }
  }
  const hasTranscript = [...new Set(tl.clips.map((c) => c.assetId))].every((id) => input.sources.get(id)?.transcript);
  const ctx = {
    versao_atual: {
      duracao_total: timelineDuration(tl),
      duracao_clipes: clipsDuration(tl),
      formato: tl.format.preset,
      enquadramento: tl.format.reframe,
      estilo: tl.styleId,
      legendas: tl.captions.enabled ? tl.captions.style : "desativadas",
      musica: tl.audio.music ? "sim" : "não",
      logos: tl.logos.map((l) => l.mode),
      trechos: clips,
      silencios: silences.slice(0, 60),
    },
    transcricao_disponivel: hasTranscript,
    analise_tecnica: [...input.sources.values()].some((s) => s.analysis) ? "disponível (silêncio, cenas, movimento)" : "indisponível",
    marca: input.brand
      ? { nome: input.brand.name, segmento: input.brand.segment, tom: input.brand.tone, logo_oficial: Boolean(input.brand.logoAssetId), musicas_da_marca: input.brand.musicAssetIds.length }
      : null,
    musicas_enviadas: input.musicAssets.slice(0, 20),
    quadros_fornecidos: input.frames.map((f) => f.outputTime),
    pedidos_anteriores: input.history.slice(-4),
    orientacao_do_template: input.templateGuidance || null,
    musica_com_batida_detectada: Boolean(input.timeline.audio.music),
  };
  return JSON.stringify(ctx);
}

/**
 * Planeja a edição com o modelo configurado. Em qualquer falha (sem chave,
 * erro de API, recusa, JSON inválido) usa o interpretador local e informa o motivo.
 */
export async function planEdit(input: PlannerInput): Promise<PlannerOutput> {
  const c = getConfig();
  const local = (reason?: string): PlannerOutput => ({
    plan: parseCommandLocally(input.command),
    engine: "local-rules",
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    fallbackReason: reason,
  });
  if (c.aiProvider !== "anthropic" || !c.ANTHROPIC_API_KEY) return local();

  const client = new Anthropic({ apiKey: c.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const f of input.frames) {
    content.push({ type: "text", text: `Quadro do vídeo final em t=${f.outputTime}s:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.jpegBase64 } });
  }
  content.push({ type: "text", text: `Contexto do projeto (JSON):\n${buildPlannerContext(input)}` });
  content.push({ type: "text", text: `Pedido do usuário:\n${input.command.slice(0, 4000)}` });

  try {
    const response = await client.beta.messages.create({
      model: c.AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: c.AI_EFFORT, format: { type: "json_schema", schema: editPlanJsonSchema() } },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const inputTokens = (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens ?? 0;
    const costUsd = estimateAiCost(inputTokens, outputTokens);
    if (response.stop_reason === "refusal") {
      return { ...local("O modelo recusou o pedido; usado o interpretador local."), inputTokens, outputTokens, costUsd };
    }
    if (response.stop_reason === "max_tokens") {
      return { ...local("Resposta do modelo incompleta; usado o interpretador local."), inputTokens, outputTokens, costUsd };
    }
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    const raw = JSON.parse(text);
    const plan = planFromEnvelope(raw);
    log.info("ai_plan", {
      requested: (raw.operations ?? []).map((o: { op?: string; args?: string }) => `${o.op} ${String(o.args ?? "").slice(0, 200)}`),
      applied: plan.operations.map((o) => o.op),
    });
    return { plan, engine: "anthropic", model: response.model, inputTokens, outputTokens, costUsd };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      log.error("ai_auth_failed", { err });
      return local("A chave da API de IA é inválida; usado o interpretador local.");
    }
    if (err instanceof Anthropic.RateLimitError) return local("Limite de uso da IA atingido no momento; usado o interpretador local.");
    if (err instanceof Anthropic.APIError) {
      log.error("ai_api_error", { status: err.status, detail: aiErrorDetail(err) });
      return local(`${describeAiError(err)} Usado o interpretador local.`);
    }
    log.error("ai_plan_invalid", { err });
    return local("A IA retornou um plano inválido; usado o interpretador local.");
  }
}
