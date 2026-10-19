import { describe, expect, it } from "vitest";
import { planFromEnvelope } from "../src/edit-plan";

describe("plano compacto da IA (op + args em JSON)", () => {
  it("valida cada operação com o schema do motor", () => {
    const plan = planFromEnvelope({
      reply: "Vou cortar para 30 segundos e legendar.",
      operations: [
        { op: "target_duration", args: '{"seconds": 30, "strategy": "best_moments"}' },
        { op: "set_captions", args: '{"enabled": true, "style": "dynamic", "position": null}' },
      ],
    });
    expect(plan.operations).toEqual([
      { op: "target_duration", seconds: 30, strategy: "best_moments" },
      { op: "set_captions", enabled: true, style: "dynamic", position: null },
    ]);
  });

  it("operação com argumentos inválidos nunca é aplicada: vira unsupported com motivo", () => {
    const plan = planFromEnvelope({
      reply: "ok",
      operations: [
        { op: "set_format", args: '{"preset": "tiktok_inexistente"}' },
        { op: "trim_start", args: "não é json" },
        { op: "remove_range", args: '{"start": 1, "end": 2, "op": "trim_end"}' },
      ],
    });
    expect(plan.operations[0]).toMatchObject({ op: "unsupported", request: "set_format" });
    expect(plan.operations[1]).toMatchObject({ op: "unsupported", request: "trim_start" });
    // o nome da operação vem do campo "op" validado, nunca de dentro de args
    expect(plan.operations[2]).toEqual({ op: "remove_range", start: 1, end: 2 });
  });

  it("tolera campos anuláveis ausentes e números como texto", () => {
    const plan = planFromEnvelope({
      reply: "ok",
      operations: [
        { op: "set_captions", args: '{"enabled": true}' },
        { op: "target_duration", args: '{"seconds": "30", "strategy": "best_moments"}' },
        { op: "add_logo", args: '{"placement": "end_card"}' },
      ],
    });
    expect(plan.operations).toEqual([
      { op: "set_captions", enabled: true, style: null, position: null },
      { op: "target_duration", seconds: 30, strategy: "best_moments" },
      { op: "add_logo", placement: "end_card", duration_sec: null },
    ]);
  });

  it("rejeita nome de operação desconhecido e planos enormes", () => {
    expect(() => planFromEnvelope({ reply: "", operations: [{ op: "rm_rf", args: "{}" }] })).toThrow();
    const many = Array.from({ length: 31 }, () => ({ op: "trim_start", args: '{"seconds": 1}' }));
    expect(() => planFromEnvelope({ reply: "", operations: many })).toThrow();
  });
});
