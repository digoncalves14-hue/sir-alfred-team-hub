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
