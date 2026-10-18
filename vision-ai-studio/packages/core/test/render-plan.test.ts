import { describe, expect, it } from "vitest";
import { buildRenderCommand, coverCrop, escapeFilterPath } from "../src/render-plan";
import { outputDimensions, resolutionAllowed } from "../src/presets";
import { A, LOGO, tl } from "./helpers";

const inputs = (hasAudio = true) => ({
  assets: new Map([[A, { path: "/tmp/in.mp4", width: 1920, height: 1080, hasAudio, hasVideo: true, duration: 60 }]]),
  images: new Map([[LOGO, "/tmp/logo.png"]]),
  audios: new Map(),
  assPath: null,
  fontsDir: null,
});

describe("plano de renderização", () => {
  it("dimensões por preset", () => {
    expect(outputDimensions("instagram_reels_9x16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(outputDimensions("youtube_16x9", "720p")).toEqual({ width: 1280, height: 720 });
    expect(outputDimensions("instagram_feed_4x5", "1080p")).toEqual({ width: 1080, height: 1350 });
    expect(resolutionAllowed("2160p", 1920, 1080)).toBe(false);
    expect(resolutionAllowed("2160p", 3840, 2160)).toBe(true);
  });

  it("recorte centrado no foco, limitado à imagem", () => {
    const c = coverCrop(1920, 1080, 1080, 1920, 0.8, 0.5);
    expect(c.sh).toBe(1920);
    expect(c.x).toBeGreaterThan(0);
    expect(c.x + 1080).toBeLessThanOrEqual(c.sw);
    expect(coverCrop(1920, 1080, 1080, 1920, 1, 0.5).x).toBe(c.sw - 1080);
  });

  it("gera argumentos sem shell, com um input por clipe e cartela final", () => {
    const t = tl({ logos: [{ assetId: LOGO, mode: "end_card", durationSec: 3, position: "top_right", backgroundColor: "#000000", scale: 0.4 }] }, [[0, 10], [20, 25]]);
    const cmd = buildRenderCommand(t, inputs(), { resolution: "720p" }, "/tmp/out.mp4", "/tmp/graph.txt");
    expect(cmd.durationSec).toBe(18);
    expect(cmd.args.filter((a) => a === "-i")).toHaveLength(3);
    expect(cmd.args).toContain("-filter_complex_script");
    expect(cmd.filterGraph).toContain("concat=n=3:v=1:a=1");
    expect(cmd.filterGraph).toContain("loudnorm");
  });

  it("gera trilha silenciosa para vídeos sem áudio", () => {
    const cmd = buildRenderCommand(tl({}, [[0, 5]]), inputs(false), {}, "/o.mp4", "/g.txt");
    expect(cmd.filterGraph).toContain("anullsrc");
  });

  it("recusa caminhos com caracteres perigosos no grafo", () => {
    expect(() => escapeFilterPath("/tmp/a;b'c.ass")).toThrow();
    expect(escapeFilterPath("/tmp/legenda.ass")).toBe("/tmp/legenda.ass");
  });
});
