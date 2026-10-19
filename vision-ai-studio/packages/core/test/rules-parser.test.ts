import { describe, expect, it } from "vitest";
import { parseCommandLocally, wordsToDigits, normalizeText } from "../src/rules-parser";
import { parseEditPlan } from "../src/edit-plan";

const ops = (s: string) => parseEditPlan(parseCommandLocally(s)).operations;

describe("interpretador local de comandos", () => {
  it("números por extenso", () => {
    expect(wordsToDigits(normalizeText("Faça uma versão de trinta e cinco segundos"))).toContain("35 segundos");
  });

  it("crie uma versão de 30 segundos", () => {
    expect(ops("crie uma versão de 30 segundos")).toContainEqual({ op: "target_duration", seconds: 30, strategy: "best_moments" });
  });

  it("retire os primeiros cinco segundos", () => {
    expect(ops("Retire os primeiros cinco segundos.")).toEqual([{ op: "trim_start", seconds: 5 }]);
  });

  it("comando completo do exemplo do produto", () => {
    const o = ops(
      "Pegue esse vídeo de um corte masculino, crie um Reels de 40 segundos, selecione as melhores cenas, coloque uma música elegante, adicione legendas automáticas e finalize com o logotipo da Sir Alfred.",
    );
    expect(o).toContainEqual({ op: "set_format", preset: "instagram_reels_9x16" });
    expect(o).toContainEqual({ op: "target_duration", seconds: 40, strategy: "best_moments" });
    expect(o.some((x) => x.op === "set_captions" && x.enabled)).toBe(true);
    expect(o.some((x) => x.op === "add_logo" && x.placement === "end_card")).toBe(true);
    expect(o.some((x) => x.op === "set_music" && x.action === "add")).toBe(true);
    expect(o.some((x) => x.op === "trim_end")).toBe(false);
  });

  it("remover momentos parados", () => {
    const o = ops("Remova os momentos em que não acontece nada.");
    expect(o.some((x) => x.op === "remove_static")).toBe(true);
  });

  it("formato vertical / quadrado / youtube", () => {
    expect(ops("deixe vertical")).toContainEqual({ op: "set_format", preset: "instagram_reels_9x16" });
    expect(ops("versão quadrada para o facebook")).toContainEqual({ op: "set_format", preset: "facebook_feed_1x1" });
    expect(ops("formato do YouTube")).toContainEqual({ op: "set_format", preset: "youtube_16x9" });
    expect(ops("faça um short")).toContainEqual({ op: "set_format", preset: "youtube_shorts_9x16" });
  });

  it("zoom sem tempo explícito vira resposta honesta; com tempo vira operação", () => {
    expect(ops("Aproxime a câmera quando o barbeiro estiver realizando o acabamento")[0].op).toBe("unsupported");
    expect(ops("aproxime de 10 a 15 segundos")).toContainEqual({ op: "zoom_range", start: 10, end: 15, zoom: 1.35, focus_x: null, focus_y: null });
  });

  it("remover trecho por intervalo", () => {
    expect(ops("remova de 10 a 20 segundos")).toContainEqual({ op: "remove_range", start: 10, end: 20 });
  });

  it("sem legendas / sem música", () => {
    expect(ops("tire as legendas")).toContainEqual({ op: "set_captions", enabled: false, style: null, position: null });
    expect(ops("remova a música")).toContainEqual({ op: "set_music", action: "remove", asset_id: null, volume: null, ducking: null });
  });

  it("pedido incompreensível responde com exemplos", () => {
    const p = parseCommandLocally("bom dia");
    expect(p.operations).toEqual([]);
    expect(p.reply).toMatch(/Exemplos/);
  });
});
