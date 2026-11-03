import { describe, expect, it } from "vitest";
import { createSseParser } from "./sse";
import { forSpeech, SentenceBuffer } from "./sentences";

describe("SSE", () => {
  it("monta eventos mesmo com pedaços cortados", () => {
    const got: [string, string][] = [];
    const p = createSseParser((e, d) => got.push([e, d]));
    p.feed('event: delta\ndata: {"type":"delta","te');
    p.feed('xt":"Olá"}\n\nevent: done\r\n');
    p.feed('data: {"type":"done"}\r\n\r\n');
    expect(got).toEqual([
      ["delta", '{"type":"delta","text":"Olá"}'],
      ["done", '{"type":"done"}'],
    ]);
  });
});

describe("frases para a fala em streaming", () => {
  it("libera frases completas e guarda o resto", () => {
    const b = new SentenceBuffer();
    expect(b.push("Bom dia, senhor. Você tem três comp")).toEqual(["Bom dia, senhor."]);
    expect(b.push("romissos hoje! O primeiro")).toEqual(["Você tem três compromissos hoje!"]);
    expect(b.flush()).toBe("O primeiro");
  });

  it("não corta abreviações, valores e horários", () => {
    const b = new SentenceBuffer();
    const out = b.push("O Sr. Rafael faturou R$ 1.234,56 até as 15.30 de hoje. Ótimo resultado. ");
    expect(out).toEqual(["O Sr. Rafael faturou R$ 1.234,56 até as 15.30 de hoje.", "Ótimo resultado."]);
  });

  it("quebra de linha encerra frase; frases curtas esperam", () => {
    const b = new SentenceBuffer();
    expect(b.push("Ok. ")).toEqual([]);
    expect(b.push("Vou verificar a agenda.\nPronto")).toEqual(["Ok. Vou verificar a agenda."]);
    expect(b.flush()).toBe("Pronto");
  });

  it("limpa markdown para a fala", () => {
    expect(forSpeech("**Faturamento**: R$ 9.500 🚀 veja https://x.com")).toBe("Faturamento: R$ 9.500 veja o link");
  });
});
