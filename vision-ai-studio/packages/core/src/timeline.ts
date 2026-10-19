import { z } from "zod";
import { FormatPresetId } from "./presets";
import { CaptionStyleId } from "./caption-styles";

/**
 * Timeline = fonte única da verdade de um projeto. É um documento JSON imutável
 * por versão (tabela timeline_versions). O preview no navegador e o renderizador
 * FFmpeg leem exatamente esta estrutura, garantindo que o que se vê é o que se exporta.
 *
 * Todos os tempos de clipe são em segundos do arquivo de ORIGEM (sourceStart/sourceEnd).
 * O tempo de SAÍDA é derivado da ordem dos clipes.
 */

export const ReframeMode = z.enum([
  /** Recorta para preencher o quadro, centralizado no ponto de interesse (auto ou manual). */
  "fill",
  /** Vídeo inteiro sobre fundo desfocado do próprio vídeo. */
  "fit_blur",
  /** Vídeo inteiro com barras pretas. */
  "fit",
]);
export type ReframeMode = z.infer<typeof ReframeMode>;

export const Clip = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().uuid(),
  sourceStart: z.number().min(0),
  sourceEnd: z.number().positive(),
  /** Centro horizontal/vertical do recorte (0..1). null = usar a análise automática. */
  focusX: z.number().min(0).max(1).nullable().default(null),
  focusY: z.number().min(0).max(1).nullable().default(null),
  /** Origem do enquadramento, para mostrar ao usuário de forma honesta. */
  focusSource: z.enum(["auto_motion", "manual", "center"]).default("center"),
  volume: z.number().min(0).max(2).default(1),
  /** Aproximação digital (1 = sem zoom). Aplicada no recorte, centrada no foco. */
  zoom: z.number().min(1).max(2.5).default(1),
  /** Rótulo opcional (ex.: motivo da seleção pela IA). */
  label: z.string().max(200).optional(),
  /** Aproximação automática do "zoom dinâmico" (punch-in); recalculada a cada edição. */
  punch: z.boolean().default(false),
});
export type Clip = z.infer<typeof Clip>;

export const CaptionBlock = z.object({
  id: z.string().max(64),
  /** Tempo na ORIGEM, para que a legenda acompanhe os cortes. */
  assetId: z.string().uuid(),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(300),
  /** Palavras com tempos (opcional) — usadas no estilo "palavra destacada". */
  words: z
    .array(z.object({ text: z.string().max(80), start: z.number(), end: z.number() }))
    .max(60)
    .optional(),
});
export type CaptionBlock = z.infer<typeof CaptionBlock>;

export const CaptionPosition = z.enum(["bottom", "center", "top"]);

export const CaptionsConfig = z.object({
  enabled: z.boolean().default(false),
  style: CaptionStyleId.default("premium_minimal"),
  position: CaptionPosition.default("bottom"),
  /** Escala relativa ao tamanho padrão do estilo. */
  fontScale: z.number().min(0.5).max(2).default(1),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  uppercase: z.boolean().optional(),
  /** Blocos gerados da transcrição e editáveis pelo usuário. */
  blocks: z.array(CaptionBlock).max(5000).default([]),
});
export type CaptionsConfig = z.infer<typeof CaptionsConfig>;

export const MusicConfig = z.object({
  assetId: z.string().uuid(),
  volume: z.number().min(0).max(1.5).default(0.25),
  /** Abaixa a música automaticamente durante a fala (sidechain). */
  ducking: z.boolean().default(true),
  fadeInSec: z.number().min(0).max(10).default(1),
  fadeOutSec: z.number().min(0).max(10).default(2),
});
export type MusicConfig = z.infer<typeof MusicConfig>;

export const AudioConfig = z.object({
  originalVolume: z.number().min(0).max(2).default(1),
  normalize: z.boolean().default(true),
  denoise: z.boolean().default(false),
  music: MusicConfig.nullable().default(null),
});

export const TRANSITION_IDS = ["none", "fade", "flash", "zoom", "blur"] as const;
export const TransitionId = z.enum(TRANSITION_IDS);
export type TransitionId = z.infer<typeof TransitionId>;

/**
 * Transição aplicada em cada corte, nas bordas dos clipes (sem sobrepor clipes):
 * a duração do vídeo e o sincronismo das legendas não mudam.
 */
export const TransitionsConfig = z.object({
  type: TransitionId.default("none"),
  durationSec: z.number().min(0.1).max(1.2).default(0.4),
});

export const LOOK_IDS = ["none", "cinematic", "warm", "vibrant", "cool", "bw", "clean"] as const;
export const LookId = z.enum(LOOK_IDS);
export type LookId = z.infer<typeof LookId>;

export const TEXT_ROLES = ["hook", "title", "cta", "lower_third"] as const;

/**
 * Texto animado sobre o vídeo (gancho, título, chamada para ação). O tempo é
 * ancorado no início ou no fim do vídeo para continuar correto após novos cortes.
 */
export const TextOverlay = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(120),
  role: z.enum(TEXT_ROLES).default("title"),
  anchor: z.enum(["start", "end"]).default("start"),
  /** Segundos a partir do início (anchor=start) ou antes do fim dos clipes (anchor=end). */
  offsetSec: z.number().min(0).max(600).default(0),
  durationSec: z.number().min(0.5).max(30).default(3),
  position: z.enum(["top", "center", "bottom"]).default("center"),
});
export type TextOverlay = z.infer<typeof TextOverlay>;

export const LogoConfig = z.object({
  assetId: z.string().uuid(),
  /** end_card: cartela final com a logo oficial; watermark: logo no canto durante o vídeo. */
  mode: z.enum(["end_card", "watermark"]),
  durationSec: z.number().min(1).max(10).default(3),
  position: z.enum(["top_left", "top_right", "bottom_left", "bottom_right"]).default("top_right"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0B0B0C"),
  /** Largura da logo em fração da largura do vídeo. */
  scale: z.number().min(0.05).max(0.9).default(0.45),
  /** Cor de destaque da cartela (degradê e detalhes); normalmente a cor da marca. */
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Frase curta abaixo da logo na cartela (ex.: slogan) e chamada para ação. */
  headline: z.string().max(60).optional(),
  cta: z.string().max(60).optional(),
});
export type LogoConfig = z.infer<typeof LogoConfig>;

export const TimelineSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  format: z.object({
    preset: FormatPresetId,
    fps: z.number().int().min(12).max(60).default(30),
    reframe: ReframeMode.default("fill"),
  }),
  clips: z.array(Clip).max(500),
  captions: CaptionsConfig.default({}),
  audio: AudioConfig.default({}),
  logos: z.array(LogoConfig).max(2).default([]),
  transitions: TransitionsConfig.default({}),
  look: LookId.default("none"),
  texts: z.array(TextOverlay).max(20).default([]),
  /** Zoom dinâmico: alterna enquadramento normal e aproximado em cortes secos (estilo Reels). */
  dynamicZoom: z
    .object({ enabled: z.boolean().default(false), intensity: z.number().min(0.05).max(0.3).default(0.12) })
    .default({}),
  styleId: z.string().max(64).optional(),
  brandId: z.string().uuid().nullable().optional(),
});
export type Timeline = z.infer<typeof TimelineSchema>;
export type TimelineInput = z.input<typeof TimelineSchema>;

export function parseTimeline(input: unknown): Timeline {
  const tl = TimelineSchema.parse(input);
  for (const c of tl.clips) {
    if (c.sourceEnd <= c.sourceStart) {
      throw new Error(`Clipe ${c.id} tem fim antes do início.`);
    }
  }
  return tl;
}

export function clipDuration(c: Pick<Clip, "sourceStart" | "sourceEnd">): number {
  return Math.max(0, c.sourceEnd - c.sourceStart);
}

/** Duração apenas dos clipes (sem cartela final). */
export function clipsDuration(tl: Pick<Timeline, "clips">): number {
  return round3(tl.clips.reduce((s, c) => s + clipDuration(c), 0));
}

export function endCardDuration(tl: Pick<Timeline, "logos">): number {
  const card = tl.logos.find((l) => l.mode === "end_card");
  return card ? card.durationSec : 0;
}

/** Duração total do vídeo final. */
export function timelineDuration(tl: Pick<Timeline, "clips" | "logos">): number {
  return round3(clipsDuration(tl) + endCardDuration(tl));
}

export interface PlacedClip {
  clip: Clip;
  index: number;
  outStart: number;
  outEnd: number;
}

export function placeClips(tl: Pick<Timeline, "clips">): PlacedClip[] {
  let t = 0;
  return tl.clips.map((clip, index) => {
    const d = clipDuration(clip);
    const placed = { clip, index, outStart: round3(t), outEnd: round3(t + d) };
    t += d;
    return placed;
  });
}

/**
 * Converte um intervalo da origem para os intervalos correspondentes na saída.
 * Um trecho de origem pode aparecer em mais de um clipe (ou em nenhum).
 */
export function mapSourceRangeToOutput(
  tl: Pick<Timeline, "clips">,
  assetId: string,
  start: number,
  end: number,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const p of placeClips(tl)) {
    if (p.clip.assetId !== assetId) continue;
    const s = Math.max(start, p.clip.sourceStart);
    const e = Math.min(end, p.clip.sourceEnd);
    if (e - s > 0.001) {
      out.push({
        start: round3(p.outStart + (s - p.clip.sourceStart)),
        end: round3(p.outStart + (e - p.clip.sourceStart)),
      });
    }
  }
  return out;
}

/** Converte um instante da saída para (clipe, tempo na origem). */
export function outputTimeToSource(
  tl: Pick<Timeline, "clips">,
  t: number,
): { clipIndex: number; assetId: string; sourceTime: number } | null {
  for (const p of placeClips(tl)) {
    if (t >= p.outStart && t < p.outEnd) {
      return { clipIndex: p.index, assetId: p.clip.assetId, sourceTime: p.clip.sourceStart + (t - p.outStart) };
    }
  }
  return null;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

let idCounter = 0;
export function newClipId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `c_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
