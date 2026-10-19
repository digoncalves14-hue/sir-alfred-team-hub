import { beforeAll, describe, expect, it } from "vitest";
import { resetConfig } from "../src/config";
import { buildContentPrompt, generateContent } from "../src/content-generator";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgres://unused";
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AI_PROVIDER = "none";
  resetConfig();
});

describe("gerador de textos", () => {
  const input = {
    projectName: "Degradê clássico",
    brand: { name: "Sir Alfred Barbearia", segment: "Barbearia premium", tone: "Sofisticada", contentTypes: [] },
    destinations: ["instagram_reels_9x16"],
    durationSec: 31.4,
    transcript: "Hoje vamos fazer um degradê clássico.",
    editSummary: ["Versão de 30s"],
    frames: [],
  };
  it("sem chave de IA recusa com mensagem clara (nada é inventado)", async () => {
    await expect(generateContent(input)).rejects.toMatchObject({ code: "ai_not_configured" });
  });
  it("prompt usa apenas o material do vídeo", () => {
    const p = JSON.parse(buildContentPrompt(input));
    expect(p.fala_do_video).toContain("degradê");
    expect(p.duracao_segundos).toBe(31);
    expect(p.marca.name).toBe("Sir Alfred Barbearia");
  });
});
