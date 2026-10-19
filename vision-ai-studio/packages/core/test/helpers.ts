import type { AssetAnalysis, TranscriptData } from "../src/analysis";
import { parseTimeline, type Timeline } from "../src/timeline";

export const A = "11111111-1111-4111-8111-111111111111";
export const B = "22222222-2222-4222-8222-222222222222";
export const LOGO = "33333333-3333-4333-8333-333333333333";
export const MUSIC = "44444444-4444-4444-8444-444444444444";

export function tl(over: Partial<Timeline> = {}, clips?: Array<[number, number, string?]>): Timeline {
  return parseTimeline({
    format: { preset: "youtube_16x9", fps: 30, reframe: "fill" },
    clips: (clips ?? [[0, 60]]).map(([s, e, id], i) => ({ id: `c${i}`, assetId: id ?? A, sourceStart: s, sourceEnd: e })),
    ...over,
  });
}

/** Análise sintética: 60s, movimento alto entre 20-30s, silêncio 5-10s e 40-48s. */
export function analysis(duration = 60): AssetAnalysis {
  const sampleRate = 2;
  const n = duration * sampleRate;
  const motion = Array.from({ length: n }, (_, i) => (i / sampleRate >= 20 && i / sampleRate < 30 ? 0.9 : 0.15));
  return {
    version: 1,
    duration,
    hasAudio: true,
    silences: [
      { start: 5, end: 10 },
      { start: 40, end: 48 },
    ],
    sceneCuts: [15, 30, 45],
    activity: {
      sampleRate,
      motion,
      centroidX: Array.from({ length: n }, (_, i) => (i / sampleRate >= 20 && i / sampleRate < 30 ? 0.8 : 0.5)),
      centroidY: Array.from({ length: n }, () => 0.5),
    },
    meanVolumeDb: -20,
    soundIntervals: [
      { start: 0, end: 5 },
      { start: 10, end: 40 },
      { start: 48, end: 60 },
    ],
    staticIntervals: [{ start: 40, end: 48 }],
  };
}

export function transcript(): TranscriptData {
  const sentences = [
    { start: 0.5, end: 4.5, text: "Bem-vindo à Sir Alfred." },
    { start: 10.2, end: 16, text: "Hoje vamos fazer um degradê clássico." },
    { start: 16.5, end: 24, text: "Primeiro a máquina, depois a tesoura." },
    { start: 24.5, end: 30, text: "O acabamento faz toda a diferença." },
    { start: 48.5, end: 55, text: "Agende seu horário com a gente." },
  ];
  const words = sentences.flatMap((s) => {
    const parts = s.text.split(" ");
    const step = (s.end - s.start) / parts.length;
    return parts.map((p, i) => ({ text: p, start: s.start + i * step, end: s.start + (i + 1) * step - 0.05 }));
  });
  return { language: "pt", text: sentences.map((s) => s.text).join(" "), words, segments: sentences };
}
