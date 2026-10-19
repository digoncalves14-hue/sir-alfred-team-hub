import { describe, expect, it } from "vitest";
import { applyEditPlan, type EngineContext } from "../src/engine";
import { clipsDuration, timelineDuration } from "../src/timeline";
import type { SourceMap } from "../src/selection";
import { A, LOGO, MUSIC, analysis, tl, transcript } from "./helpers";

function ctx(over: Partial<EngineContext> = {}, withTranscript = true): EngineContext {
  const sources: SourceMap = new Map([[A, { assetId: A, duration: 60, analysis: analysis(), transcript: withTranscript ? transcript() : null }]]);
  return { sources, brand: null, musicAssetIds: [], ...over };
}

describe("motor de edição", () => {
  it("remove os primeiros segundos (trim_start)", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "trim_start", seconds: 5 }] }, ctx());
    expect(clipsDuration(r.timeline)).toBe(55);
    expect(r.timeline.clips[0].sourceStart).toBe(5);
  });

  it("remove o final e um trecho no meio, dividindo clipes", () => {
    const r = applyEditPlan(
      tl(),
      { reply: "", operations: [{ op: "trim_end", seconds: 10 }, { op: "remove_range", start: 20, end: 30 }] },
      ctx(),
    );
    expect(clipsDuration(r.timeline)).toBe(40);
    expect(r.timeline.clips.map((c) => [c.sourceStart, c.sourceEnd])).toEqual([
      [0, 20],
      [30, 50],
    ]);
  });

  it("mantém apenas um trecho (keep_range) — critério de aceite 2", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "keep_range", start: 12, end: 22.5 }] }, ctx());
    expect(r.timeline.clips).toHaveLength(1);
    expect(r.timeline.clips[0].sourceStart).toBe(12);
    expect(r.timeline.clips[0].sourceEnd).toBe(22.5);
  });

  it("cria versão de 30s com os melhores momentos, em ordem cronológica — critério 5", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "target_duration", seconds: 30, strategy: "best_moments" }] }, ctx());
    const d = clipsDuration(r.timeline);
    expect(d).toBeGreaterThanOrEqual(27);
    expect(d).toBeLessThanOrEqual(31);
    const starts = r.timeline.clips.map((c) => c.sourceStart);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // o trecho com movimento intenso e fala (20-30s) deve estar presente
    expect(r.timeline.clips.some((c) => c.sourceStart <= 24.5 && c.sourceEnd >= 29)).toBe(true);
    // silêncio longo 40-48 não deve ser escolhido
    expect(r.timeline.clips.some((c) => c.sourceStart >= 40 && c.sourceEnd <= 48)).toBe(false);
  });

  it("com fala parcial, trechos só de ação também podem ser escolhidos", () => {
    const partial = { ...transcript(), segments: transcript().segments.slice(0, 1), words: transcript().words.filter((w) => w.end < 5) };
    const sources: SourceMap = new Map([[A, { assetId: A, duration: 60, analysis: analysis(), transcript: partial }]]);
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "target_duration", seconds: 20, strategy: "best_moments" }] }, { sources, brand: null, musicAssetIds: [] });
    expect(clipsDuration(r.timeline)).toBeGreaterThan(18);
    // o trecho de movimento intenso (20-30s, sem fala nesta transcrição) entra na seleção
    expect(r.timeline.clips.some((c) => c.sourceStart < 28 && c.sourceEnd > 22)).toBe(true);
  });

  it("versão curta funciona também sem transcrição (apenas análise técnica)", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "target_duration", seconds: 15, strategy: "best_moments" }] }, ctx({}, false));
    expect(clipsDuration(r.timeline)).toBeGreaterThan(12);
    expect(clipsDuration(r.timeline)).toBeLessThanOrEqual(16);
  });

  it("não corta quando o material já é menor que o alvo", () => {
    const r = applyEditPlan(tl({}, [[0, 20]]), { reply: "", operations: [{ op: "target_duration", seconds: 30, strategy: "best_moments" }] }, ctx());
    expect(clipsDuration(r.timeline)).toBe(20);
    expect(r.warnings.join(" ")).toMatch(/nada foi cortado/);
  });

  it("remove silêncios com margem", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "remove_silences", min_silence_sec: 1, padding_sec: 0.2 }] }, ctx());
    // silêncios de 5s e 8s menos 0.4s de margem cada
    expect(clipsDuration(r.timeline)).toBeCloseTo(60 - 4.6 - 7.6, 1);
    expect(r.timeline.clips).toHaveLength(3);
  });

  it("muda formato e aplica reenquadramento automático pelo movimento", () => {
    const r = applyEditPlan(
      tl({}, [[20, 30]]),
      { reply: "", operations: [{ op: "set_format", preset: "instagram_reels_9x16" }] },
      ctx(),
    );
    expect(r.timeline.format.preset).toBe("instagram_reels_9x16");
    expect(r.timeline.clips[0].focusSource).toBe("auto_motion");
    expect(r.timeline.clips[0].focusX).toBeCloseTo(0.8, 2);
  });

  it("preserva enquadramento manual", () => {
    const base = tl({}, [[20, 30]]);
    base.clips[0].focusX = 0.2;
    base.clips[0].focusSource = "manual";
    const r = applyEditPlan(base, { reply: "", operations: [{ op: "set_format", preset: "youtube_shorts_9x16" }] }, ctx());
    expect(r.timeline.clips[0].focusX).toBe(0.2);
  });

  it("ativa legendas a partir da transcrição", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "set_captions", enabled: true, style: "dynamic", position: null }] }, ctx());
    expect(r.timeline.captions.enabled).toBe(true);
    expect(r.timeline.captions.style).toBe("dynamic");
    expect(r.timeline.captions.blocks.length).toBeGreaterThan(5);
  });

  it("não ativa legendas sem transcrição e avisa", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "set_captions", enabled: true, style: null, position: null }] }, ctx({}, false));
    expect(r.timeline.captions.enabled).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/transcrição/);
  });

  it("logo: usa apenas a logo oficial cadastrada; sem logo responde honestamente", () => {
    const sem = applyEditPlan(tl(), { reply: "", operations: [{ op: "add_logo", placement: "end_card", duration_sec: null }] }, ctx({
      brand: { id: "b", name: "Sir Alfred", logoAssetId: null, musicAssetIds: [], primaryColor: null, defaultStyleId: null },
    }));
    expect(sem.timeline.logos).toHaveLength(0);
    expect(sem.unsupported[0].reason).toMatch(/logo oficial/);

    const com = applyEditPlan(tl(), { reply: "", operations: [{ op: "add_logo", placement: "end_card", duration_sec: 4 }] }, ctx({
      brand: { id: "b", name: "Sir Alfred", logoAssetId: LOGO, musicAssetIds: [], primaryColor: "#0B0B0C", defaultStyleId: null },
    }));
    expect(com.timeline.logos[0]).toMatchObject({ assetId: LOGO, mode: "end_card", durationSec: 4 });
    expect(timelineDuration(com.timeline)).toBe(64);
  });

  it("música: só usa faixas enviadas pelo usuário", () => {
    const sem = applyEditPlan(tl(), { reply: "", operations: [{ op: "set_music", action: "add", asset_id: "x", volume: null, ducking: null }] }, ctx());
    expect(sem.timeline.audio.music).toBeNull();
    expect(sem.unsupported).toHaveLength(1);
    const com = applyEditPlan(tl(), { reply: "", operations: [{ op: "set_music", action: "add", asset_id: null, volume: 0.3, ducking: true }] }, ctx({ musicAssetIds: [MUSIC] }));
    expect(com.timeline.audio.music?.assetId).toBe(MUSIC);
  });

  it("zoom em trecho divide o clipe e aplica o fator", () => {
    const r = applyEditPlan(tl(), { reply: "", operations: [{ op: "zoom_range", start: 10, end: 20, zoom: 1.4, focus_x: null, focus_y: null }] }, ctx());
    expect(r.timeline.clips.map((c) => [c.sourceStart, c.sourceEnd, c.zoom])).toEqual([
      [0, 10, 1],
      [10, 20, 1.4],
      [20, 60, 1],
    ]);
  });

  it("recusa planos que apagariam todo o conteúdo", () => {
    expect(() =>
      applyEditPlan(tl({}, [[0, 2]]), { reply: "", operations: [{ op: "remove_range", start: 0, end: 2 }] }, ctx()),
    ).toThrow(/todo o conteúdo/);
  });

  it("registra pedidos não suportados sem alterar a timeline", () => {
    const base = tl();
    const r = applyEditPlan(base, { reply: "", operations: [{ op: "unsupported", request: "x", reason: "y" }] }, ctx());
    expect(r.unsupported).toEqual([{ request: "x", reason: "y" }]);
    expect(clipsDuration(r.timeline)).toBe(60);
  });
});
