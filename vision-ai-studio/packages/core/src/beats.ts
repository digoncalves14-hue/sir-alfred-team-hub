import { z } from "zod";

/**
 * Detecção de batida (tempo) de uma música a partir de PCM mono.
 * Método: envelope de "onset" (variação positiva de energia logarítmica em
 * janelas de ~12 ms) → autocorrelação para estimar o BPM (70–180) → fase da
 * grade escolhida pelo maior somatório de onsets. É uma estimativa técnica:
 * funciona bem em músicas com pulso marcado; em faixas sem ritmo definido o
 * resultado vem com confiança baixa e a sincronização não é oferecida.
 */
export const MusicAnalysis = z.object({
  version: z.literal(1),
  kind: z.literal("music"),
  duration: z.number(),
  bpm: z.number().nullable(),
  confidence: z.number(),
  beats: z.array(z.number()),
});
export type MusicAnalysis = z.infer<typeof MusicAnalysis>;

export function detectBeats(samples: Int16Array, sampleRate: number): MusicAnalysis {
  const hop = Math.max(1, Math.round(sampleRate * 0.0116));
  const frames = Math.floor(samples.length / hop);
  const duration = samples.length / sampleRate;
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) s += samples[i] * samples[i];
    energy[f] = Math.log1p(s / hop);
  }
  const onset = new Float64Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  // força absoluta do pulso: média dos 5% maiores aumentos de energia (em unidades log).
  // Tons contínuos/sem ritmo ficam perto de zero e não recebem grade de batidas.
  const sortedOnset = [...onset].sort((a, b) => b - a);
  const top = sortedOnset.slice(0, Math.max(1, Math.floor(frames * 0.05)));
  const strength = top.reduce((a, b) => a + b, 0) / top.length;
  if (strength < 0.25) return { version: 1, kind: "music", duration, bpm: null, confidence: 0, beats: [] };
  const mean = onset.reduce((a, b) => a + b, 0) / Math.max(1, frames);
  for (let f = 0; f < frames; f++) onset[f] = Math.max(0, onset[f] - mean);

  const fps = sampleRate / hop;
  const minLag = Math.floor((60 / 180) * fps);
  const maxLag = Math.ceil((60 / 70) * fps);
  let bestLag = 0;
  let best = 0;
  let total = 0;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f] * onset[f - lag];
    s /= frames - lag;
    // leve preferência por tempos próximos de 120 BPM (evita metades/dobros)
    const bpm = (60 * fps) / lag;
    s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    scores.push(s);
    total += s;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  const meanScore = total / Math.max(1, scores.length);
  const confidence = meanScore > 0 ? Math.min(1, (best / meanScore - 1) / 3) * Math.min(1, strength / 0.8) : 0;
  if (!bestLag || confidence < 0.15) return { version: 1, kind: "music", duration, bpm: null, confidence, beats: [] };

  // período fracionário (interpolação parabólica em torno do melhor atraso)
  const k = bestLag - minLag;
  const y0 = scores[k - 1] ?? scores[k];
  const y2 = scores[k + 1] ?? scores[k];
  const denom = y0 - 2 * scores[k] + y2;
  const lag = denom !== 0 ? bestLag + (0.5 * (y0 - y2)) / denom : bestLag;
  const period = lag; // em quadros

  let bestPhase = 0;
  let phaseScore = -1;
  for (let p = 0; p < Math.ceil(period); p++) {
    let s = 0;
    for (let x = p; x < frames; x += period) s += onset[Math.round(x)] ?? 0;
    if (s > phaseScore) {
      phaseScore = s;
      bestPhase = p;
    }
  }
  const beats: number[] = [];
  const win = Math.max(1, Math.round(period * 0.12));
  for (let x = bestPhase; x < frames; x += period) {
    // ajusta cada batida ao pico de onset mais próximo (corrige pequenos desvios)
    const c = Math.round(x);
    let bi = c;
    for (let i = Math.max(0, c - win); i <= Math.min(frames - 1, c + win); i++) if (onset[i] > onset[bi]) bi = i;
    beats.push(Math.round((bi / fps) * 1000) / 1000);
  }
  return { version: 1, kind: "music", duration, bpm: Math.round(((60 * fps) / lag) * 10) / 10, confidence: Math.round(confidence * 100) / 100, beats };
}

/** Batidas no tempo do vídeo final, repetindo a grade quando a música toca em loop. */
export function beatsUntil(m: MusicAnalysis, until: number): number[] {
  if (!m.beats.length || m.duration <= 0) return [];
  const out: number[] = [];
  for (let offset = 0; offset < until; offset += m.duration) {
    for (const b of m.beats) {
      const t = b + offset;
      if (t > until) return out;
      out.push(t);
    }
  }
  return out;
}

export function nearest(sorted: number[], t: number): number | null {
  let lo = 0;
  let hi = sorted.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = lo > 0 ? sorted[lo - 1] : a;
  return Math.abs(a - t) < Math.abs(b - t) ? a : b;
}
