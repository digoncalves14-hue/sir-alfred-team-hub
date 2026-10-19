import {
  type AssetAnalysis,
  type Interval,
  type TranscriptData,
  averageTrack,
  intersectIntervals,
} from "./analysis";
import { type Clip, clipDuration, newClipId, placeClips, round3 } from "./timeline";
import type { EditStyle } from "./styles";

export interface SourceContext {
  assetId: string;
  duration: number;
  analysis: AssetAnalysis | null;
  transcript: TranscriptData | null;
}

export type SourceMap = Map<string, SourceContext>;

export interface Unit {
  assetId: string;
  start: number;
  end: number;
  /** Ordem cronológica na timeline atual. */
  order: number;
  score: number;
  reasons: string[];
  /** Herdados do clipe de onde o trecho saiu. */
  base: Clip;
}

/**
 * Divide o material atual da timeline em unidades candidatas.
 * - Com transcrição: frases completas (preserva o sentido da fala).
 * - Sem transcrição: limites de cena e de silêncio, com janelas limitadas pelo estilo.
 */
export function buildUnits(clips: Clip[], sources: SourceMap, style: EditStyle): Unit[] {
  const units: Unit[] = [];
  let order = 0;
  for (const clip of clips) {
    const src = sources.get(clip.assetId);
    const ranges = src?.transcript?.segments.length
      ? sentenceRanges(clip, src.transcript, style, src.analysis)
      : boundaryRanges(clip, src?.analysis ?? null, style);
    for (const r of ranges) {
      units.push({ assetId: clip.assetId, start: r.start, end: r.end, order: order++, score: 0, reasons: [], base: clip });
    }
  }
  return units;
}

function sentenceRanges(clip: Clip, transcript: TranscriptData, style: EditStyle, analysis: AssetAnalysis | null): Interval[] {
  const segs = transcript.segments
    .map((s) => ({ start: Math.max(s.start, clip.sourceStart), end: Math.min(s.end, clip.sourceEnd) }))
    .filter((s) => s.end - s.start > 0.2)
    .sort((a, b) => a.start - b.start);
  if (!segs.length) return boundaryRanges(clip, analysis, style);
  // agrupa frases curtas consecutivas até a duração mínima do estilo
  const speech: Interval[] = [];
  let cur: Interval | null = null;
  for (const s of segs) {
    if (!cur) {
      cur = { ...s };
    } else if (cur.end - cur.start < style.minClipSec && s.start - cur.end < 1.2) {
      cur.end = s.end;
    } else {
      speech.push(cur);
      cur = { ...s };
    }
  }
  if (cur) speech.push(cur);
  // trechos SEM fala (ex.: demonstração, ação) também são candidatos
  const gaps: Interval[] = [];
  let t = clip.sourceStart;
  for (const s of speech) {
    if (s.start - t >= 1) gaps.push({ start: t, end: s.start });
    t = Math.max(t, s.end);
  }
  if (clip.sourceEnd - t >= 1) gaps.push({ start: t, end: clip.sourceEnd });
  const gapUnits = gaps.flatMap((g) => boundaryRanges({ ...clip, sourceStart: g.start, sourceEnd: g.end }, analysis, style));
  return [...speech, ...gapUnits]
    .sort((a, b) => a.start - b.start)
    .map((r) => ({ start: round3(r.start), end: round3(r.end) }));
}

function boundaryRanges(clip: Clip, analysis: AssetAnalysis | null, style: EditStyle): Interval[] {
  const points = new Set<number>([clip.sourceStart, clip.sourceEnd]);
  if (analysis) {
    for (const c of analysis.sceneCuts) points.add(c);
    for (const s of analysis.silences) {
      points.add(s.start);
      points.add(s.end);
    }
  }
  const sorted = [...points].filter((p) => p >= clip.sourceStart && p <= clip.sourceEnd).sort((a, b) => a - b);
  const windows: Interval[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const d = end - start;
    if (d <= 0.05) continue;
    if (d > style.maxClipSec) {
      const parts = Math.ceil(d / style.maxClipSec);
      const step = d / parts;
      for (let p = 0; p < parts; p++) windows.push({ start: start + p * step, end: start + (p + 1) * step });
    } else {
      windows.push({ start, end });
    }
  }
  // junta janelas muito curtas à vizinha
  const merged: Interval[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && (w.end - w.start < style.minClipSec * 0.5 || last.end - last.start < style.minClipSec * 0.5) && w.end - last.start <= style.maxClipSec) {
      last.end = w.end;
    } else {
      merged.push({ ...w });
    }
  }
  return merged.map((r) => ({ start: round3(r.start), end: round3(r.end) }));
}

/**
 * Pontuação heurística de cada unidade (0..1). NÃO é previsão de engajamento:
 * combina movimento detectado, presença de som/fala e penaliza silêncio/estática.
 */
export function scoreUnits(units: Unit[], sources: SourceMap, style: EditStyle): Unit[] {
  return units.map((u) => {
    const src = sources.get(u.assetId);
    const a = src?.analysis ?? null;
    const d = u.end - u.start;
    const reasons: string[] = [];
    let motion = 0.3;
    if (a?.activity) {
      motion = averageTrack(a.activity.motion, a.activity.sampleRate, u.start, u.end) ?? 0.3;
    }
    let speech = 0;
    if (src?.transcript?.words.length) {
      const words = src.transcript.words.filter((w) => w.start >= u.start && w.end <= u.end).length;
      speech = Math.min(1, words / d / 2.5);
    } else if (a?.hasAudio) {
      speech = overlapFraction(a.soundIntervals, u.start, u.end);
    }
    const silent = a ? overlapFraction(a.silences, u.start, u.end) : 0;
    const hasAudio = a ? a.hasAudio : true;
    const mw = hasAudio ? style.motionWeight : 1;
    const sw = hasAudio ? style.speechWeight : 0;
    let score = mw * motion + sw * speech - 0.25 * silent;
    if (d < style.minClipSec * 0.6) score -= 0.1;
    score = Math.max(0, Math.min(1, score));
    if (motion > 0.5) reasons.push("movimento intenso");
    if (speech > 0.5) reasons.push(src?.transcript ? "fala contínua" : "som contínuo");
    if (silent > 0.4) reasons.push("muito silêncio");
    return { ...u, score: round3(score), reasons };
  });
}

function overlapFraction(intervals: Interval[], start: number, end: number): number {
  const d = end - start;
  if (d <= 0) return 0;
  const ov = intersectIntervals(intervals, [{ start, end }]).reduce((s, i) => s + (i.end - i.start), 0);
  return Math.min(1, ov / d);
}

export interface SelectionResult {
  clips: Clip[];
  selected: Unit[];
  warnings: string[];
}

/**
 * Seleciona trechos até atingir a duração-alvo, mantendo a ordem cronológica
 * para preservar a continuidade da narrativa.
 */
export function selectForDuration(
  clips: Clip[],
  sources: SourceMap,
  style: EditStyle,
  target: number,
  strategy: "best_moments" | "beginning" | "speech_focused",
): SelectionResult {
  const warnings: string[] = [];
  const total = clips.reduce((s, c) => s + clipDuration(c), 0);
  if (total <= target + 0.25) {
    warnings.push(
      `O material disponível tem ${total.toFixed(1)}s, que já é menor ou igual a ${target}s; nada foi cortado.`,
    );
    return { clips, selected: [], warnings };
  }
  if (strategy === "beginning") {
    return { clips: trimToDuration(clips, target), selected: [], warnings };
  }
  const effStyle = strategy === "speech_focused" ? { ...style, speechWeight: 1, motionWeight: 0 } : style;
  const units = scoreUnits(buildUnits(clips, sources, effStyle), sources, effStyle);
  const tolerance = Math.max(0.5, target * 0.03);
  const ranked = [...units].sort((a, b) => b.score - a.score || a.order - b.order);
  const chosen: Unit[] = [];
  let acc = 0;
  for (const u of ranked) {
    if (acc >= target - tolerance) break;
    const d = u.end - u.start;
    const remaining = target - acc;
    if (d <= remaining + tolerance) {
      chosen.push(u);
      acc += d;
    } else if (remaining >= Math.min(style.minClipSec, 1.5)) {
      const end = cutPoint(u, remaining, sources.get(u.assetId)?.transcript ?? null);
      if (end - u.start >= 1) {
        chosen.push({ ...u, end, reasons: [...u.reasons, "encurtado"] });
        acc += end - u.start;
      }
    }
  }
  chosen.sort((a, b) => a.order - b.order);
  const out: Clip[] = [];
  for (const u of chosen) {
    out.push({
      ...u.base,
      id: newClipId(),
      sourceStart: u.start,
      sourceEnd: u.end,
      label: `Pontuação ${(u.score * 100).toFixed(0)}${u.reasons.length ? ` · ${u.reasons.join(", ")}` : ""}`,
    });
  }
  return { clips: mergeContiguous(out), selected: chosen, warnings };
}

/** Escolhe um ponto de corte que não quebre palavras quando há transcrição. */
function cutPoint(u: Unit, maxLen: number, transcript: TranscriptData | null): number {
  const hard = u.start + maxLen;
  if (!transcript) return round3(hard);
  const words = transcript.words.filter((w) => w.end > u.start && w.end <= hard);
  if (!words.length) return round3(hard);
  // prefere terminar em pontuação
  for (let i = words.length - 1; i >= 0; i--) {
    if (/[.!?…]$/.test(words[i].text) && words[i].end - u.start >= maxLen * 0.6) return round3(words[i].end + 0.1);
  }
  return round3(Math.min(hard, words[words.length - 1].end + 0.1));
}

export function mergeContiguous(clips: Clip[]): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    const last = out[out.length - 1];
    if (
      last &&
      last.assetId === c.assetId &&
      Math.abs(last.sourceEnd - c.sourceStart) < 0.05 &&
      last.focusX === c.focusX &&
      last.focusY === c.focusY &&
      last.volume === c.volume &&
      last.zoom === c.zoom
    ) {
      last.sourceEnd = c.sourceEnd;
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

export function trimToDuration(clips: Clip[], target: number): Clip[] {
  const out: Clip[] = [];
  let acc = 0;
  for (const c of clips) {
    if (acc >= target) break;
    const d = clipDuration(c);
    if (acc + d <= target) {
      out.push({ ...c });
      acc += d;
    } else {
      out.push({ ...c, sourceEnd: round3(c.sourceStart + (target - acc)) });
      acc = target;
    }
  }
  return out;
}

/** Remove um intervalo do tempo de SAÍDA, dividindo clipes quando necessário. */
export function removeOutputRange(clips: Clip[], start: number, end: number): Clip[] {
  if (end <= start) return clips;
  const out: Clip[] = [];
  for (const p of placeClips({ clips })) {
    const c = p.clip;
    if (p.outEnd <= start || p.outStart >= end) {
      out.push({ ...c });
      continue;
    }
    if (p.outStart < start) {
      out.push({ ...c, sourceEnd: round3(c.sourceStart + (start - p.outStart)) });
    }
    if (p.outEnd > end) {
      out.push({ ...c, id: out.some((o) => o.id === c.id) ? newClipId() : c.id, sourceStart: round3(c.sourceStart + (end - p.outStart)) });
    }
  }
  return out.filter((c) => clipDuration(c) > 0.04);
}

/** Subtrai intervalos de ORIGEM (ex.: silêncios) dos clipes. */
export function subtractSourceIntervals(clips: Clip[], removeByAsset: Map<string, Interval[]>): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    const remove = (removeByAsset.get(c.assetId) ?? [])
      .filter((r) => r.end > c.sourceStart && r.start < c.sourceEnd)
      .sort((a, b) => a.start - b.start);
    let cursor = c.sourceStart;
    let first = true;
    for (const r of remove) {
      if (r.start > cursor + 0.04) {
        out.push({ ...c, id: first ? c.id : newClipId(), sourceStart: round3(cursor), sourceEnd: round3(Math.min(r.start, c.sourceEnd)) });
        first = false;
      }
      cursor = Math.max(cursor, r.end);
    }
    if (c.sourceEnd > cursor + 0.04) {
      out.push({ ...c, id: first ? c.id : newClipId(), sourceStart: round3(cursor), sourceEnd: c.sourceEnd });
    }
  }
  return out;
}

/** Silêncios a remover com margem (padding) de cada lado. */
export function silencesToRemove(
  sources: SourceMap,
  minSilence: number,
  padding: number,
): Map<string, Interval[]> {
  const map = new Map<string, Interval[]>();
  for (const [assetId, src] of sources) {
    let silences: Interval[] = src.analysis?.hasAudio ? src.analysis.silences : [];
    if ((!silences.length || !src.analysis?.hasAudio) && src.transcript?.words.length) {
      // sem análise de áudio, usa lacunas entre palavras da transcrição
      silences = gapsFromWords(src.transcript, src.duration);
    }
    map.set(
      assetId,
      silences
        .filter((s) => s.end - s.start >= minSilence)
        .map((s) => ({
          start: s.start <= 0.01 ? 0 : s.start + padding,
          end: s.end >= src.duration - 0.01 ? src.duration : s.end - padding,
        }))
        .filter((s) => s.end - s.start > 0.05),
    );
  }
  return map;
}

function gapsFromWords(t: TranscriptData, duration: number): Interval[] {
  const gaps: Interval[] = [];
  let last = 0;
  for (const w of t.words) {
    if (w.start - last > 0.3) gaps.push({ start: last, end: w.start });
    last = Math.max(last, w.end);
  }
  if (duration - last > 0.3) gaps.push({ start: last, end: duration });
  return gaps;
}

export function staticToRemove(sources: SourceMap, minDuration: number): Map<string, Interval[]> {
  const map = new Map<string, Interval[]>();
  for (const [assetId, src] of sources) {
    const a = src.analysis;
    if (!a) continue;
    const quiet = a.hasAudio ? intersectIntervals(a.staticIntervals, a.silences) : a.staticIntervals;
    map.set(assetId, quiet.filter((i) => i.end - i.start >= minDuration));
  }
  return map;
}

/** Divide clipes nos limites [start, end] (tempo de saída) e aplica `fn` aos pedaços internos. */
export function mapOutputRange(clips: Clip[], start: number, end: number, fn: (c: Clip) => Clip): Clip[] {
  const out: Clip[] = [];
  for (const p of placeClips({ clips })) {
    const c = p.clip;
    if (p.outEnd <= start || p.outStart >= end) {
      out.push({ ...c });
      continue;
    }
    const s = Math.max(start, p.outStart);
    const e = Math.min(end, p.outEnd);
    const srcS = round3(c.sourceStart + (s - p.outStart));
    const srcE = round3(c.sourceStart + (e - p.outStart));
    if (srcS - c.sourceStart > 0.04) out.push({ ...c, sourceEnd: srcS });
    out.push(fn({ ...c, id: srcS - c.sourceStart > 0.04 ? newClipId() : c.id, sourceStart: srcS, sourceEnd: srcE }));
    if (c.sourceEnd - srcE > 0.04) out.push({ ...c, id: newClipId(), sourceStart: srcE });
  }
  return out;
}
