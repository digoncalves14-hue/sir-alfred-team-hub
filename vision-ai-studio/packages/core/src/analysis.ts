import { z } from "zod";

/** Resultado da análise técnica de um arquivo (feita pelo worker com FFmpeg). */
export const Interval = z.object({ start: z.number(), end: z.number() });
export type Interval = z.infer<typeof Interval>;

export const ActivityTrack = z.object({
  /** Amostras por segundo. */
  sampleRate: z.number().positive(),
  /** Energia de movimento normalizada 0..1 por amostra. */
  motion: z.array(z.number()),
  /** Centro horizontal do movimento 0..1 por amostra (0.5 quando parado). */
  centroidX: z.array(z.number()),
  centroidY: z.array(z.number()),
});
export type ActivityTrack = z.infer<typeof ActivityTrack>;

export const AssetAnalysis = z.object({
  version: z.literal(1),
  duration: z.number(),
  hasAudio: z.boolean(),
  silences: z.array(Interval),
  /** Instantes de troca de cena (segundos). */
  sceneCuts: z.array(z.number()),
  activity: ActivityTrack.nullable(),
  meanVolumeDb: z.number().nullable(),
  /** Trechos não silenciosos com áudio (aproximação de fala/som). */
  soundIntervals: z.array(Interval),
  /** Trechos de vídeo praticamente estáticos (pouco movimento e sem som relevante). */
  staticIntervals: z.array(Interval),
});
export type AssetAnalysis = z.infer<typeof AssetAnalysis>;

export const TranscriptWord = z.object({ text: z.string(), start: z.number(), end: z.number() });
export type TranscriptWord = z.infer<typeof TranscriptWord>;

export const TranscriptSegment = z.object({ start: z.number(), end: z.number(), text: z.string() });
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const TranscriptData = z.object({
  language: z.string(),
  text: z.string(),
  words: z.array(TranscriptWord),
  segments: z.array(TranscriptSegment),
});
export type TranscriptData = z.infer<typeof TranscriptData>;

export interface MediaProbe {
  durationSec: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  rotation: number;
  bitRate: number | null;
  formatName: string;
  sizeBytes: number | null;
}

/** Interpreta a saída JSON do ffprobe (-show_streams -show_format). */
export function parseFfprobe(json: unknown): MediaProbe {
  const data = json as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video" && (s.disposition as Record<string, number> | undefined)?.attached_pic !== 1);
  const a = streams.find((s) => s.codec_type === "audio");
  const fmt = data.format ?? {};
  const duration = num(fmt.duration) ?? num(v?.duration) ?? num(a?.duration) ?? 0;
  let rotation = 0;
  const tags = (v?.tags ?? {}) as Record<string, string>;
  if (tags.rotate) rotation = Number(tags.rotate) || 0;
  const sideData = (v?.side_data_list ?? []) as Array<Record<string, unknown>>;
  for (const sd of sideData) {
    if (typeof sd.rotation === "number") rotation = sd.rotation;
  }
  rotation = ((Math.round(rotation) % 360) + 360) % 360;
  let width = num(v?.width);
  let height = num(v?.height);
  if (width && height && (rotation === 90 || rotation === 270)) {
    [width, height] = [height, width];
  }
  return {
    durationSec: duration,
    width,
    height,
    fps: v ? parseRate(String(v.avg_frame_rate ?? v.r_frame_rate ?? "")) : null,
    videoCodec: v ? String(v.codec_name ?? "") || null : null,
    audioCodec: a ? String(a.codec_name ?? "") || null : null,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    rotation,
    bitRate: num(fmt.bit_rate),
    formatName: String(fmt.format_name ?? ""),
    sizeBytes: num(fmt.size),
  };
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseRate(rate: string): number | null {
  const [n, d] = rate.split("/").map(Number);
  if (!n) return null;
  const fps = d ? n / d : n;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 100) / 100 : null;
}

/** Interpreta o stderr do filtro silencedetect. */
export function parseSilenceDetect(stderr: string, duration: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) {
      open = Math.max(0, Number(s[1]));
      continue;
    }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && open !== null) {
      out.push({ start: round(open), end: round(Number(e[1])) });
      open = null;
    }
  }
  if (open !== null && duration > open) out.push({ start: round(open), end: round(duration) });
  return out;
}

/** Interpreta o stderr do filtro showinfo após select='gt(scene,X)'. */
export function parseSceneCuts(stderr: string): number[] {
  const cuts: number[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    if (!line.includes("Parsed_showinfo")) continue;
    const m = line.match(/pts_time:\s*([\d.]+)/);
    if (m) cuts.push(round(Number(m[1])));
  }
  return [...new Set(cuts)].sort((a, b) => a - b);
}

export function parseMeanVolume(stderr: string): number | null {
  const m = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  return m ? Number(m[1]) : null;
}

/**
 * Calcula energia de movimento e centroide por diferença absoluta entre quadros
 * consecutivos em tons de cinza (amostrados em baixa resolução).
 * É uma análise técnica real, porém simples: indica ONDE há movimento na imagem,
 * não O QUE está acontecendo. Não substitui detecção de pessoas/objetos.
 */
export function computeActivity(frames: Uint8Array, width: number, height: number, sampleRate: number): ActivityTrack {
  const frameSize = width * height;
  const count = Math.floor(frames.length / frameSize);
  const motion: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  for (let f = 0; f < count; f++) {
    if (f === 0) {
      motion.push(0);
      cx.push(0.5);
      cy.push(0.5);
      continue;
    }
    const cur = f * frameSize;
    const prev = (f - 1) * frameSize;
    let total = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        let d = Math.abs(frames[cur + i] - frames[prev + i]);
        if (d < 12) d = 0; // ruído de compressão
        total += d;
        sx += d * x;
        sy += d * y;
      }
    }
    motion.push(total / (frameSize * 255));
    cx.push(total > 0 ? sx / total / Math.max(1, width - 1) : 0.5);
    cy.push(total > 0 ? sy / total / Math.max(1, height - 1) : 0.5);
  }
  // normaliza movimento pelo percentil 95 para ficar comparável entre vídeos
  const sorted = [...motion].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const norm = p95 > 0 ? motion.map((m) => Math.min(1, m / p95)) : motion.map(() => 0);
  return {
    sampleRate,
    motion: norm.map(round),
    centroidX: cx.map(round),
    centroidY: cy.map(round),
  };
}

/** Complemento dos silêncios dentro de [0, duration]. */
export function invertIntervals(intervals: Interval[], duration: number): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  let t = 0;
  for (const iv of sorted) {
    if (iv.start > t + 0.001) out.push({ start: round(t), end: round(Math.min(iv.start, duration)) });
    t = Math.max(t, iv.end);
  }
  if (duration > t + 0.001) out.push({ start: round(t), end: round(duration) });
  return out.filter((i) => i.end - i.start > 0.05);
}

/** Trechos com pouco movimento por pelo menos minDur segundos. */
export function findStaticIntervals(activity: ActivityTrack | null, threshold = 0.04, minDur = 2): Interval[] {
  if (!activity) return [];
  const out: Interval[] = [];
  let start: number | null = null;
  const step = 1 / activity.sampleRate;
  activity.motion.forEach((m, i) => {
    const t = i * step;
    if (m < threshold) {
      if (start === null) start = t;
    } else if (start !== null) {
      if (t - start >= minDur) out.push({ start: round(start), end: round(t) });
      start = null;
    }
  });
  const endT = activity.motion.length * step;
  if (start !== null && endT - start >= minDur) out.push({ start: round(start), end: round(endT) });
  return out;
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.start, y.start);
      const e = Math.min(x.end, y.end);
      if (e - s > 0.001) out.push({ start: round(s), end: round(e) });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Média de uma trilha amostrada dentro de [start, end). */
export function averageTrack(values: number[], sampleRate: number, start: number, end: number): number | null {
  const i0 = Math.max(0, Math.floor(start * sampleRate));
  const i1 = Math.min(values.length, Math.ceil(end * sampleRate));
  if (i1 <= i0) return null;
  let s = 0;
  for (let i = i0; i < i1; i++) s += values[i];
  return s / (i1 - i0);
}

/** Média de centroide ponderada pelo movimento — usada no reenquadramento automático. */
export function weightedFocus(activity: ActivityTrack, start: number, end: number): { x: number; y: number } | null {
  const i0 = Math.max(1, Math.floor(start * activity.sampleRate));
  const i1 = Math.min(activity.motion.length, Math.ceil(end * activity.sampleRate));
  let w = 0;
  let sx = 0;
  let sy = 0;
  for (let i = i0; i < i1; i++) {
    const m = activity.motion[i];
    if (m <= 0.02) continue;
    w += m;
    sx += m * activity.centroidX[i];
    sy += m * activity.centroidY[i];
  }
  if (w < 0.05) return null;
  return { x: round(sx / w), y: round(sy / w) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
