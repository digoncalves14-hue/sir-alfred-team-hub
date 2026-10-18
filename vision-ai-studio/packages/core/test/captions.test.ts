import { describe, expect, it } from "vitest";
import { buildCaptionBlocks, captionCues, toAss, toSrt, escapeAssText, assColor } from "../src/captions";
import { A, tl, transcript } from "./helpers";

describe("legendas", () => {
  const blocks = buildCaptionBlocks(transcript(), A, "premium_minimal");

  it("divide em blocos curtos sem ultrapassar o limite de palavras", () => {
    expect(blocks.length).toBeGreaterThan(5);
    for (const b of blocks) {
      expect(b.words!.length).toBeLessThanOrEqual(6);
      expect(b.end).toBeGreaterThan(b.start);
    }
  });

  it("acompanha os cortes: tempos de saída deslocados e trechos removidos somem", () => {
    const t = tl({ captions: { enabled: true, style: "premium_minimal", position: "bottom", fontScale: 1, blocks } }, [[10, 30]]);
    const cues = captionCues(t);
    expect(cues[0].start).toBeCloseTo(0.2, 1); // 10.2 na origem → 0.2 na saída
    expect(cues.every((c) => c.end <= 20.001)).toBe(true);
    expect(cues.some((c) => c.text.includes("Bem-vindo"))).toBe(false);
  });

  it("gera SRT válido", () => {
    const t = tl({ captions: { enabled: true, style: "premium_minimal", position: "bottom", fontScale: 1, blocks } });
    const srt = toSrt(captionCues(t));
    expect(srt).toMatch(/^1\n00:00:00,500 --> 00:00:0\d,\d{3}\n/);
  });

  it("gera ASS com estilo e escapa caracteres de controle", () => {
    const t = tl({ format: { preset: "instagram_reels_9x16", fps: 30, reframe: "fill" }, captions: { enabled: true, style: "highlight_word", position: "bottom", fontScale: 1, blocks } });
    const ass = toAss(t, captionCues(t), { width: 1080, height: 1920 });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Dialogue:");
    expect(ass).toContain("{\\c"); // destaque de palavra
    expect(escapeAssText("a{\\b1}b")).toBe("a(/b1)b");
    expect(assColor("#D4AF37")).toBe("&H0037AFD4");
  });
});
