import { z } from "zod";
import { FORMAT_PRESET_IDS } from "./presets";
import { CAPTION_STYLE_IDS } from "./caption-styles";
import { EDIT_STYLE_IDS } from "./styles";

/**
 * Plano de edição: o ÚNICO formato pelo qual a IA (ou o interpretador local)
 * pode alterar um projeto. A IA nunca gera comandos FFmpeg. O plano é validado
 * e aplicado por um motor determinístico (engine.ts) que produz uma nova
 * versão da timeline.
 *
 * O schema é mantido "plano" (todos os campos obrigatórios, nulos quando não se
 * aplicam) para ser compatível com saídas estruturadas de modelos de linguagem.
 * Limites numéricos são aplicados pelo motor, não pelo schema.
 */

export const OpTrimStart = z.object({
  op: z.literal("trim_start"),
  seconds: z.number().describe("Segundos a remover do início do vídeo final"),
});
export const OpTrimEnd = z.object({
  op: z.literal("trim_end"),
  seconds: z.number().describe("Segundos a remover do final do vídeo"),
});
export const OpKeepRange = z.object({
  op: z.literal("keep_range"),
  start: z.number().describe("Início (segundos, no tempo do vídeo final atual)"),
  end: z.number().describe("Fim (segundos, no tempo do vídeo final atual)"),
});
export const OpRemoveRange = z.object({
  op: z.literal("remove_range"),
  start: z.number().describe("Início do trecho a remover (tempo do vídeo final atual)"),
  end: z.number().describe("Fim do trecho a remover (tempo do vídeo final atual)"),
});
export const OpTargetDuration = z.object({
  op: z.literal("target_duration"),
  seconds: z.number().describe("Duração desejada do vídeo final, sem contar a cartela da logo"),
  strategy: z
    .enum(["best_moments", "beginning", "speech_focused"])
    .describe("best_moments: melhores trechos por heurística; beginning: mantém o começo; speech_focused: prioriza fala"),
});
export const OpZoomRange = z.object({
  op: z.literal("zoom_range"),
  start: z.number().describe("Início do trecho (tempo do vídeo final atual)"),
  end: z.number().describe("Fim do trecho (tempo do vídeo final atual)"),
  zoom: z.number().describe("Fator de aproximação entre 1.1 e 2.0 (ex.: 1.35)"),
  focus_x: z.number().nullable().describe("Centro horizontal do zoom 0..1 (null = automático)"),
  focus_y: z.number().nullable().describe("Centro vertical do zoom 0..1 (null = automático)"),
});
export const OpRemoveSilences = z.object({
  op: z.literal("remove_silences"),
  min_silence_sec: z.number().describe("Silêncios maiores que isso são removidos (ex.: 0.7)"),
  padding_sec: z.number().describe("Margem mantida antes/depois da fala (ex.: 0.15)"),
});
export const OpRemoveStatic = z.object({
  op: z.literal("remove_static"),
  min_duration_sec: z.number().describe("Remove trechos sem movimento e sem som maiores que isso"),
});
export const OpSetFormat = z.object({
  op: z.literal("set_format"),
  preset: z.enum(FORMAT_PRESET_IDS),
});
export const OpSetReframe = z.object({
  op: z.literal("set_reframe"),
  mode: z.enum(["fill", "fit_blur", "fit"]),
});
export const OpSetCaptions = z.object({
  op: z.literal("set_captions"),
  enabled: z.boolean(),
  style: z.enum(CAPTION_STYLE_IDS).nullable(),
  position: z.enum(["bottom", "center", "top"]).nullable(),
});
export const OpAddLogo = z.object({
  op: z.literal("add_logo"),
  placement: z.enum(["end_card", "watermark"]),
  duration_sec: z.number().nullable(),
});
export const OpRemoveLogo = z.object({
  op: z.literal("remove_logo"),
  placement: z.enum(["end_card", "watermark", "all"]),
});
export const OpSetMusic = z.object({
  op: z.literal("set_music"),
  action: z.enum(["add", "remove", "adjust"]),
  asset_id: z.string().nullable().describe("ID de uma música enviada pelo usuário ou da marca; null = escolher a da marca"),
  volume: z.number().nullable().describe("0 a 1"),
  ducking: z.boolean().nullable(),
});
export const OpSetAudio = z.object({
  op: z.literal("set_audio"),
  original_volume: z.number().nullable().describe("0 a 2 (1 = original)"),
  normalize: z.boolean().nullable(),
  denoise: z.boolean().nullable(),
});
export const OpSetStyle = z.object({
  op: z.literal("set_style"),
  style_id: z.enum(EDIT_STYLE_IDS),
});
export const OpRemoveSourceRange = z.object({
  op: z.literal("remove_source_range"),
  asset_id: z.string().describe("ID do vídeo de origem"),
  start: z.number().describe("Início no tempo do arquivo de ORIGEM"),
  end: z.number().describe("Fim no tempo do arquivo de ORIGEM"),
});
export const OpRestoreSourceRange = z.object({
  op: z.literal("restore_source_range"),
  asset_id: z.string(),
  start: z.number().describe("Início no tempo do arquivo de ORIGEM"),
  end: z.number().describe("Fim no tempo do arquivo de ORIGEM"),
});
export const OpSyncToBeat = z.object({
  op: z.literal("sync_to_beat"),
  max_shift_sec: z.number().describe("Deslocamento máximo de cada corte até a batida (ex.: 0.35)"),
});
export const OpUnsupported = z.object({
  op: z.literal("unsupported"),
  request: z.string().describe("Parte do pedido que não pode ser executada"),
  reason: z.string().describe("Explicação honesta em português do motivo"),
});

export const EditOperation = z.discriminatedUnion("op", [
  OpTrimStart,
  OpTrimEnd,
  OpKeepRange,
  OpRemoveRange,
  OpTargetDuration,
  OpZoomRange,
  OpRemoveSilences,
  OpRemoveStatic,
  OpSetFormat,
  OpSetReframe,
  OpSetCaptions,
  OpAddLogo,
  OpRemoveLogo,
  OpSetMusic,
  OpSetAudio,
  OpSetStyle,
  OpRemoveSourceRange,
  OpRestoreSourceRange,
  OpSyncToBeat,
  OpUnsupported,
]);
export type EditOperation = z.infer<typeof EditOperation>;

export const EditPlanSchema = z.object({
  reply: z.string().describe("Resposta curta ao usuário, em português do Brasil, explicando o que será feito"),
  operations: z.array(EditOperation),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;

/** Nomes de todas as operações aceitas pelo motor. */
export const EDIT_OP_NAMES = EditOperation.options.map((o) => o.shape.op.value) as [EditOperation["op"], ...EditOperation["op"][]];

/**
 * Formato compacto usado com saídas estruturadas da IA: o schema completo (20
 * operações) gera uma gramática grande demais para o provedor. A IA devolve cada
 * operação como nome + argumentos em JSON (texto), e cada uma é validada aqui
 * com o mesmo schema do motor. Operações inválidas nunca são aplicadas: viram
 * "unsupported" com o motivo, para o usuário ver.
 */
export const EditPlanEnvelopeSchema = z.object({
  reply: z.string().describe("Resposta curta ao usuário, em português do Brasil"),
  operations: z.array(
    z.object({
      op: z.enum(EDIT_OP_NAMES),
      args: z.string().describe('Objeto JSON com os demais campos da operação, ex.: {"seconds": 30, "strategy": "best_moments"}'),
    }),
  ),
});
export type EditPlanEnvelope = z.infer<typeof EditPlanEnvelopeSchema>;

const OP_SCHEMAS = new Map(EditOperation.options.map((o) => [o.shape.op.value as string, o]));

/**
 * Tolerância a deslizes comuns do modelo, sem afrouxar a validação: campos
 * anuláveis ausentes viram null e números enviados como texto ("30") viram
 * número. Campos desconhecidos são descartados pelo schema.
 */
function normalizeArgs(op: string, args: Record<string, unknown>): Record<string, unknown> {
  const schema = OP_SCHEMAS.get(op);
  const out: Record<string, unknown> = { ...args, op };
  if (!schema) return out;
  for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
    if (key === "op") continue;
    if (out[key] === undefined && field.isNullable()) out[key] = null;
    const base = field instanceof z.ZodNullable ? field.unwrap() : field;
    if (base instanceof z.ZodNumber && typeof out[key] === "string" && out[key] !== "" && Number.isFinite(Number(out[key]))) {
      out[key] = Number(out[key]);
    }
  }
  return out;
}

export function planFromEnvelope(input: unknown): EditPlan {
  const env = EditPlanEnvelopeSchema.parse(input);
  if (env.operations.length > 30) throw new Error("Plano de edição com operações demais.");
  const operations = env.operations.map((item): EditOperation => {
    let args: unknown;
    try {
      args = JSON.parse(item.args || "{}");
    } catch {
      args = null;
    }
    const parsed = args && typeof args === "object" && !Array.isArray(args) ? EditOperation.safeParse(normalizeArgs(item.op, args as Record<string, unknown>)) : null;
    if (parsed?.success) return parsed.data;
    return {
      op: "unsupported",
      request: item.op,
      reason: "A IA gerou parâmetros inválidos para esta operação; ela não foi aplicada.",
    };
  });
  return { reply: env.reply, operations };
}

export function parseEditPlan(input: unknown): EditPlan {
  const plan = EditPlanSchema.parse(input);
  if (plan.operations.length > 30) throw new Error("Plano de edição com operações demais.");
  return plan;
}
