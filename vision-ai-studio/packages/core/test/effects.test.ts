import { describe, expect, it } from "vitest";
import {
  applyEditPlan,
  buildAssFile,
  clipEffectsChain,
  parseCommandLocally,
  parseTimeline,
  placeTexts,
  transitionEdges,
  type EditOperation,
  type EngineContext,
} from "../src";

const A = "11111111-1111-4111-8111-111111111111";
const LOGO = "33333333-3333-4333-8333-333333333333";
const ctx: EngineContext = {
  sources: new Map(),
  brand: { id: "b", name: "Genesis Barber", logoAssetId: LOGO, musicAssetIds: [], primaryColor: "#111111", defaultStyleId: null, backgroundColor: "#111111", accentColor: "#C9A227" },
  musicAssetIds: [],
};
const tl0 = parseTimeline({ format: { preset: "instagram_reels_9x16" }, clips: [{ id: "c0", assetId: A, sourceStart: 0, sourceEnd: 20 }] });
const run = (tl: typeof tl0, ops: EditOperation[]) => applyEditPlan(tl, { reply: "", operations: ops }, ctx);

describe("acabamento profissional", () => {
  it("estilo dinâmico liga transição, cor e zoom dinâmico (cortes alternados, idempotente)", () => {
    const r = run(tl0, [{ op: "set_style", style_id: "reels_dynamic" }]);
    expect(r.timeline.transitions.type).toBe("zoom");
    expect(r.timeline.look).toBe("vibrant");
    expect(r.timeline.dynamicZoom.enabled).toBe(true);
    const n = r.timeline.clips.length;
    expect(n).toBeGreaterThan(3);
    expect(r.timeline.clips.filter((c) => c.punch).every((c) => c.zoom > 1.1)).toBe(true);
    // reaplicar não divide de novo
    expect(run(r.timeline, []).timeline.clips.length).toBe(n);
    // cortes do zoom dinâmico são secos (trecho contínuo)
    expect(transitionEdges(r.timeline).every((e) => e.inSec === 0 && e.outSec === 0)).toBe(true);
    // desligar devolve o trecho original
    const off = run(r.timeline, [{ op: "dynamic_zoom", enabled: false, intensity: null }]);
    expect(off.timeline.clips).toHaveLength(1);
    expect(off.timeline.clips[0].zoom).toBe(1);
  });

  it("transições ficam nas bordas entre trechos diferentes e não mudam a duração", () => {
    const tl = parseTimeline({
      format: { preset: "youtube_16x9" },
      clips: [
        { id: "a", assetId: A, sourceStart: 0, sourceEnd: 3 },
        { id: "b", assetId: A, sourceStart: 10, sourceEnd: 12 },
      ],
      transitions: { type: "fade", durationSec: 0.6 },
    });
    expect(transitionEdges(tl)).toEqual([
      { inSec: 0, outSec: 0.3 },
      { inSec: 0.3, outSec: 0 },
    ]);
    const chain = clipEffectsChain({ ...tl, look: "bw" }, { inSec: 0.3, outSec: 0.3 }, 2, 1280, 720, 30);
    expect(chain).toContain("hue=s=0");
    expect(chain).toContain("fade=t=in:st=0:d=0.3:color=black");
    expect(chain).toContain("fade=t=out:st=1.7:d=0.3:color=black");
  });

  it("textos animados: gancho único, CTA ancorado no fim, texto do usuário escapado no ASS", () => {
    let tl = run(tl0, [
      { op: "add_text", text: "Primeiro gancho", role: "hook", anchor: "start", offset_sec: null, duration_sec: null, position: null },
      { op: "add_text", text: "Gancho {\\b1} novo", role: "hook", anchor: "start", offset_sec: null, duration_sec: null, position: null },
      { op: "add_text", text: "Garanta sua vaga", role: "cta", anchor: "end", offset_sec: 0, duration_sec: 3, position: null },
    ]).timeline;
    expect(tl.texts.filter((t) => t.role === "hook")).toHaveLength(1);
    const placed = placeTexts(tl);
    expect(placed.find((p) => p.overlay.role === "cta")).toMatchObject({ start: 17, end: 20 });
    // continua no fim depois de um corte
    tl = run(tl, [{ op: "trim_end", seconds: 5 }]).timeline;
    expect(placeTexts(tl).find((p) => p.overlay.role === "cta")).toMatchObject({ start: 12, end: 15 });
    const ass = buildAssFile(tl, [], { width: 1080, height: 1920, accent: "#C9A227", endCard: null })!;
    expect(ass).toContain("GANCHO (/B1) NOVO");
    expect(ass).not.toContain("{\\b1}");
  });

  it("cartela final: exige logo oficial; com logo, cria cartela com frase e chamada", () => {
    const noLogo = applyEditPlan(tl0, { reply: "", operations: [{ op: "set_end_card", headline: "x", cta: "y", duration_sec: null }] }, { ...ctx, brand: null });
    expect(noLogo.unsupported).toHaveLength(1);
    const r = run(tl0, [{ op: "set_end_card", headline: "Formação que transforma", cta: "Inscreva-se", duration_sec: null }]);
    const card = r.timeline.logos.find((l) => l.mode === "end_card")!;
    expect(card).toMatchObject({ assetId: LOGO, headline: "Formação que transforma", cta: "Inscreva-se", accentColor: "#C9A227", backgroundColor: "#111111" });
    expect(card.durationSec).toBeGreaterThanOrEqual(3.5);
  });

  it("interpretador local entende transições, cor, zoom e pedido criativo", () => {
    const p = parseCommandLocally("coloque transições com flash, cores vibrantes e zoom dinâmico");
    expect(p.operations).toEqual(
      expect.arrayContaining([
        { op: "set_transitions", type: "flash", duration_sec: null },
        { op: "set_look", look: "vibrant" },
        { op: "dynamic_zoom", enabled: true, intensity: null },
      ]),
    );
    const c = parseCommandLocally("USE SUA CRIATIVIDADE PARA DIVULGAR NOSSO CURSO");
    expect(c.operations.map((o) => o.op)).toEqual(expect.arrayContaining(["set_style", "set_captions", "add_logo"]));
  });
});

describe("legendas animadas, novas transições e efeitos sonoros", () => {
  it("efeitos sonoros: whoosh em cada transição, pop no gancho/CTA e impacto na cartela", async () => {
    const { sfxEvents } = await import("../src");
    const tl = parseTimeline({
      format: { preset: "instagram_reels_9x16" },
      clips: [
        { id: "a", assetId: A, sourceStart: 0, sourceEnd: 3 },
        { id: "b", assetId: A, sourceStart: 10, sourceEnd: 13 },
      ],
      transitions: { type: "slide", durationSec: 0.5 },
      texts: [{ id: "h", text: "Olha isso", role: "hook", anchor: "start", offsetSec: 0.5, durationSec: 2, position: "top" }],
      logos: [{ assetId: LOGO, mode: "end_card" }],
      audio: { sfx: true },
    });
    expect(sfxEvents(tl)).toEqual([
      { kind: "pop", at: 0.5 },
      { kind: "whoosh", at: 2.72 },
      { kind: "impact", at: 6 },
    ]);
    expect(sfxEvents({ ...tl, audio: { ...tl.audio, sfx: false } })).toEqual([]);
  });

  it("deslizar e glitch geram filtros só nas bordas do clipe", () => {
    const tl = parseTimeline({ format: { preset: "youtube_16x9" }, clips: [{ id: "a", assetId: A, sourceStart: 0, sourceEnd: 3 }] });
    const slide = clipEffectsChain({ ...tl, transitions: { type: "slide", durationSec: 0.6 } }, { inSec: 0.3, outSec: 0.3 }, 3, 1280, 720, 30);
    expect(slide).toContain("pad=3840:720:1280:0:black");
    expect(slide).toContain("crop=1280:720:");
    const glitch = clipEffectsChain({ ...tl, transitions: { type: "glitch", durationSec: 0.6 } }, { inSec: 0.3, outSec: 0 }, 3, 1280, 720, 30);
    expect(glitch).toContain("rgbashift");
    expect(glitch).toContain("enable='lt(t,0.3)'");
  });

  it("legenda Reels pop e marca-texto animam a palavra falada no ASS", async () => {
    const { toAss, captionCues } = await import("../src");
    const base = {
      format: { preset: "instagram_reels_9x16" },
      clips: [{ id: "a", assetId: A, sourceStart: 0, sourceEnd: 5 }],
      captions: {
        enabled: true,
        blocks: [{ id: "b1", assetId: A, start: 0.5, end: 2, text: "corte perfeito hoje", words: [{ text: "corte", start: 0.5, end: 1 }, { text: "perfeito", start: 1, end: 1.5 }, { text: "hoje", start: 1.5, end: 2 }] }],
      },
    };
    const pop = parseTimeline({ ...base, captions: { ...base.captions, style: "reels_pop" } });
    const popAss = toAss(pop, captionCues(pop), { width: 1080, height: 1920 });
    expect(popAss).toContain("\\fscx122\\fscy122\\t(0,120,\\fscx100\\fscy100)}PERFEITO");
    const marker = parseTimeline({ ...base, captions: { ...base.captions, style: "marker" } });
    const markerAss = toAss(marker, captionCues(marker), { width: 1080, height: 1920 });
    expect(markerAss).toMatch(/\\3c&H0027A2C9\\bord\d+\\c&H00111111}HOJE/);
  });
});

describe("trilha e narração por IA", () => {
  const VO = "55555555-5555-4555-8555-555555555555";
  const voT = {
    language: "pt",
    text: "Venha aprender com a Genesis",
    words: [
      { text: "Venha", start: 0, end: 0.4 },
      { text: "aprender", start: 0.45, end: 1 },
      { text: "com", start: 1.05, end: 1.2 },
      { text: "a", start: 1.25, end: 1.3 },
      { text: "Genesis", start: 1.35, end: 2 },
    ],
    segments: [{ text: "Venha aprender com a Genesis", start: 0, end: 2 }],
  };
  const vctx = { ...ctx, voiceoverAssetIds: [VO], voiceoverTranscripts: new Map([[VO, voT]]) };

  it("sem provedor, gerar trilha/narração vira 'não executado' com o motivo", () => {
    const r = run(tl0, [
      { op: "generate_music", prompt: "upbeat", instrumental: true },
      { op: "add_narration", text: "Olá", voice: null, start_sec: null },
    ]);
    expect(r.unsupported.map((u) => u.request)).toEqual(["gerar trilha sonora com IA", "narração com voz de IA"]);
  });

  it("narração gerada entra na timeline e ganha legenda no tempo certo; remover limpa tudo", async () => {
    const { captionCues } = await import("../src");
    const r = applyEditPlan(
      tl0,
      {
        reply: "",
        operations: [
          { op: "set_voiceover", asset_id: VO, start_sec: 3, volume: null },
          { op: "set_captions", enabled: true, style: "reels_pop", position: null },
        ],
      },
      vctx,
    );
    expect(r.timeline.audio.voiceover).toEqual({ assetId: VO, startSec: 3, volume: 1 });
    const cues = captionCues(r.timeline);
    expect(cues[0].start).toBe(3);
    expect(cues.flatMap((c) => c.words.map((w) => w.text))).toContain("Genesis");
    const off = applyEditPlan(r.timeline, { reply: "", operations: [{ op: "remove_narration" }] }, vctx);
    expect(off.timeline.audio.voiceover).toBeNull();
    expect(off.timeline.captions.blocks.some((b) => b.assetId === VO)).toBe(false);
  });

  it("narração de outro projeto é recusada", () => {
    const r = run(tl0, [{ op: "set_voiceover", asset_id: VO, start_sec: null, volume: null }]);
    expect(r.timeline.audio.voiceover).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/não pertence/);
  });

  it("interpretador local: gerar trilha e narração com texto entre aspas", () => {
    const p = parseCommandLocally('gere uma trilha elegante e coloque a narração "Venha conhecer nosso curso" com voz masculina');
    expect(p.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "generate_music", instrumental: true }),
        { op: "add_narration", text: "Venha conhecer nosso curso", voice: "masculina", start_sec: null },
      ]),
    );
  });
});
