import { beforeAll, describe, expect, it } from "vitest";
import { parseTimeline } from "@vision/core";
import { resetConfig } from "../src/config";
import Anthropic from "@anthropic-ai/sdk";
import { buildPlannerContext, describeAiError, editPlanJsonSchema, planEdit } from "../src/ai-planner";

const A = "11111111-1111-4111-8111-111111111111";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgres://unused";
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AI_PROVIDER = "none";
  resetConfig();
});

describe("planejador de edição", () => {
  it("JSON Schema compatível com saídas estruturadas", () => {
    const s = JSON.stringify(editPlanJsonSchema());
    expect(s).not.toContain('"const"');
    expect(s).not.toContain('"$schema"');
    expect(s).toContain('"additionalProperties":false');
    expect(s).toContain("target_duration");
  });

  it("sem chave de IA usa o interpretador local e identifica isso", async () => {
    const timeline = parseTimeline({ format: { preset: "youtube_16x9" }, clips: [{ id: "c", assetId: A, sourceStart: 0, sourceEnd: 60 }] });
    const out = await planEdit({ command: "crie uma versão de 30 segundos", timeline, sources: new Map(), brand: null, musicAssets: [], frames: [], history: [] });
    expect(out.engine).toBe("local-rules");
    expect(out.costUsd).toBe(0);
    expect(out.plan.operations[0]).toMatchObject({ op: "target_duration", seconds: 30 });
  });

  it("contexto enviado ao modelo usa tempos do vídeo final e inclui fala", () => {
    const timeline = parseTimeline({ format: { preset: "youtube_16x9" }, clips: [{ id: "c", assetId: A, sourceStart: 10, sourceEnd: 20 }] });
    const ctx = JSON.parse(
      buildPlannerContext({
        command: "x",
        timeline,
        sources: new Map([[A, { assetId: A, duration: 30, analysis: null, transcript: { language: "pt", text: "oi", words: [], segments: [{ start: 12, end: 14, text: "Olá pessoal" }] } }]]),
        brand: null,
        musicAssets: [],
        frames: [],
        history: [],
      }),
    );
    expect(ctx.versao_atual.duracao_total).toBe(10);
    expect(ctx.versao_atual.trechos[0].fala).toContain("[2s] Olá pessoal");
  });
});

describe("erros da API de IA", () => {
  const bad = (message: string) =>
    new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message } }, message, new Headers());

  it("mostra a causa informada pela API", () => {
    expect(describeAiError(bad("tool_choice not supported"))).toBe("Serviço de IA indisponível (400: tool_choice not supported).");
  });

  it("explica falta de créditos em português", () => {
    expect(describeAiError(bad("Your credit balance is too low to access the Anthropic API."))).toMatch(/sem créditos/);
  });
});
