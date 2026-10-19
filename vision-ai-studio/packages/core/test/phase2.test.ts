import { describe, expect, it } from "vitest";
import { applyEditPlan, restoreSourceRange, type EngineContext } from "../src/engine";
import { beatsUntil, detectBeats, type MusicAnalysis } from "../src/beats";
import { suggestClips } from "../src/suggestions";
import { SYSTEM_TEMPLATES, TemplateConfig, templateFromTimeline, templateToOperations } from "../src/templates";
import { parseCommandLocally } from "../src/rules-parser";
import { clipsDuration } from "../src/timeline";
import type { SourceMap } from "../src/selection";
import { A, MUSIC, analysis, tl, transcript } from "./helpers";

const sources = (): SourceMap => new Map([[A, { assetId: A, duration: 60, analysis: analysis(), transcript: transcript() }]]);
const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({ sources: sources(), brand: null, musicAssetIds: [MUSIC], ...over });

describe("edição pela transcrição", () => {
  it("remove e restaura um trecho da origem", () => {
    const removed = applyEditPlan(tl(), { reply: "", operations: [{ op: "remove_source_range", asset_id: A, start: 10.2, end: 16 }] }, ctx()).timeline;
    expect(clipsDuration(removed)).toBeCloseTo(54.2, 2);
    const restored = applyEditPlan(removed, { reply: "", operations: [{ op: "restore_source_range", asset_id: A, start: 10.2, end: 16 }] }, ctx()).timeline;
    expect(restored.clips.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([[0, 60]]);
  });
  it("restaurar não duplica o que já existe e respeita a ordem", () => {
    const clips = tl({}, [[0, 5], [20, 30]]).clips;
    const out = restoreSourceRange(clips, A, 3, 25);
    expect(out.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([[0, 30]]);
  });
});

describe("batida e sincronização", () => {
  it("detecta 120 BPM em um pulso sintético", () => {
    const sr = 8000;
    const samples = new Int16Array(sr * 12);
    for (let b = 0; b < 24; b++) {
      const at = Math.round(b * 0.5 * sr);
      for (let i = 0; i < 400; i++) samples[at + i] = Math.round(20000 * Math.sin(i / 3) * (1 - i / 400));
    }
    const m = detectBeats(samples, sr);
    expect(m.bpm).toBeGreaterThan(115);
    expect(m.bpm).toBeLessThan(125);
    expect(m.beats.length).toBeGreaterThan(18);
  });
  it("alinha os cortes à batida mais próxima", () => {
    const music: MusicAnalysis = { version: 1, kind: "music", duration: 30, bpm: 120, confidence: 0.9, beats: Array.from({ length: 60 }, (_, i) => i * 0.5) };
    expect(beatsUntil(music, 40).at(-1)).toBeLessThanOrEqual(40);
    const base = tl({ audio: { originalVolume: 1, normalize: true, denoise: false, music: { assetId: MUSIC, volume: 0.3, ducking: true, fadeInSec: 1, fadeOutSec: 2 } } }, [[0, 3.2], [10, 13.9], [20, 24]]);
    const r = applyEditPlan(base, { reply: "", operations: [{ op: "sync_to_beat", max_shift_sec: 0.35 }] }, ctx({ musicAnalyses: new Map([[MUSIC, music]]) }));
    const ends: number[] = [];
    let t = 0;
    for (const c of r.timeline.clips.slice(0, -1)) {
      t += c.sourceEnd - c.sourceStart;
      ends.push(Math.round(t * 1000) / 1000);
    }
    for (const e of ends) expect((e * 2) % 1).toBeCloseTo(0, 3);
  });
  it("sem música, sincronização é recusada com aviso", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "sync_to_beat", max_shift_sec: 0.3 }] }, ctx());
    expect(r.warnings.join(" ")).toMatch(/Adicione uma música/);
  });
  it("comando local entende sincronização", () => {
    expect(parseCommandLocally("sincronize os cortes com a batida").operations).toContainEqual({ op: "sync_to_beat", max_shift_sec: 0.35 });
  });
});

describe("sugestões de cortes", () => {
  it("gera cortes sem sobreposição, perto da duração pedida, ordenados por pontuação", () => {
    const s = suggestClips(sources(), { durationSec: 15, count: 3 });
    expect(s.length).toBeGreaterThan(0);
    for (const c of s) {
      expect(c.duration).toBeGreaterThanOrEqual(11);
      expect(c.duration).toBeLessThanOrEqual(17);
      expect(c.score).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < s.length; i++) expect(s[i - 1].score).toBeGreaterThanOrEqual(s[i].score);
    expect(s.some((c) => c.title.length > 3)).toBe(true);
  });
});

describe("templates", () => {
  it("os 11 templates do sistema são válidos e geram operações aplicáveis", () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(11);
    for (const t of SYSTEM_TEMPLATES) {
      TemplateConfig.parse(t.config);
      const ops = templateToOperations(t.config, { hasMusic: false, hasTranscript: true, hasLogo: false });
      const r = applyEditPlan(tl(), { reply: "", operations: ops }, ctx());
      expect(r.timeline.styleId).toBe(t.config.styleId);
      if (t.config.targetDurationSec) expect(clipsDuration(r.timeline)).toBeLessThanOrEqual(t.config.targetDurationSec + 1);
    }
  });
  it("salva template a partir da timeline", () => {
    const cfg = templateFromTimeline(tl({ styleId: "cinematic" }, [[0, 22]]));
    expect(cfg).toMatchObject({ styleId: "cinematic", preset: "youtube_16x9", targetDurationSec: 22, logo: "none" });
  });
});
