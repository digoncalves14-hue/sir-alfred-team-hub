import { describe, expect, it } from "vitest";
import { initialVoiceState, voiceReducer, type VoiceEvent, type VoiceState } from "./voiceMachine";
import { hasWakeWord, isStopCommand, stripWakeWord } from "./wakeWord";
import { formatUsd, relativeTime } from "./format";

const run = (events: VoiceEvent[], s: VoiceState = initialVoiceState) => events.reduce(voiceReducer, s);

describe("máquina de voz", () => {
  it("ciclo completo com sessão contínua volta a ouvir", () => {
    const s = run([
      { type: "START", continuous: true },
      { type: "PARTIAL", text: "o que temos" },
      { type: "FINAL", text: "o que temos para hoje" },
      { type: "SUBMITTED" },
      { type: "RESPONSE", willSpeak: true },
    ]);
    expect(s.phase).toBe("speaking");
    const after = voiceReducer(s, { type: "SPEECH_DONE" });
    expect(after.phase).toBe("listening");
    expect(after.listenId).toBe(s.listenId + 1);
  });

  it("sem sessão contínua termina em idle", () => {
    const s = run([{ type: "START", continuous: false }, { type: "FINAL", text: "oi" }, { type: "SUBMITTED" }, { type: "RESPONSE", willSpeak: false }]);
    expect(s.phase).toBe("idle");
  });

  it("silêncio repetido encerra a sessão", () => {
    const once = run([{ type: "START", continuous: true }, { type: "NO_SPEECH" }]);
    expect(once.phase).toBe("listening");
    const twice = voiceReducer(once, { type: "NO_SPEECH" });
    expect(twice.phase).toBe("idle");
    expect(twice.sessionActive).toBe(false);
  });

  it("final vazio conta como silêncio", () => {
    expect(run([{ type: "START", continuous: false }, { type: "FINAL", text: "   " }]).phase).toBe("idle");
  });

  it("interrupção durante a fala volta a ouvir", () => {
    const s = run([{ type: "START", continuous: false }, { type: "FINAL", text: "x" }, { type: "SUBMITTED" }, { type: "RESPONSE", willSpeak: true }, { type: "INTERRUPT" }]);
    expect(s.phase).toBe("listening");
  });

  it("ignora resultados tardios após a finalização", () => {
    const s = run([{ type: "START", continuous: false }, { type: "FINAL", text: "marque reunião" }, { type: "PARTIAL", text: "lixo" }, { type: "NO_SPEECH" }]);
    expect(s).toMatchObject({ phase: "listening", finalized: true, transcript: "marque reunião" });
    expect(voiceReducer(s, { type: "SUBMITTED" })).toMatchObject({ phase: "processing", finalized: false });
  });

  it("não inicia nova escuta durante o processamento", () => {
    const s = run([{ type: "START", continuous: false }, { type: "FINAL", text: "x" }, { type: "SUBMITTED" }, { type: "START", continuous: true }]);
    expect(s.phase).toBe("processing");
  });

  it("nível de áudio normalizado só durante a escuta", () => {
    expect(run([{ type: "START", continuous: false }, { type: "LEVEL", value: 5 }]).level).toBe(0.5);
    expect(run([{ type: "LEVEL", value: 5 }]).level).toBe(0);
    expect(run([{ type: "START", continuous: false }, { type: "LEVEL", value: -2 }]).level).toBe(0);
  });

  it("erro encerra a sessão com mensagem", () => {
    const s = run([{ type: "START", continuous: true }, { type: "ERROR", message: "sem permissão" }]);
    expect(s).toMatchObject({ phase: "error", sessionActive: false, error: "sem permissão" });
  });
});

describe("palavra de ativação", () => {
  it.each([
    ["Jarvis, o que temos para hoje?", "o que temos para hoje?"],
    ["ok jarvis marque uma reunião", "marque uma reunião"],
    ["Ei, Jarvis! Qual é a última decisão?", "Qual é a última decisão?"],
    ["Javis lembre disso", "lembre disso"],
    ["Qual foi nossa última decisão?", "Qual foi nossa última decisão?"],
  ])("%s → %s", (input, out) => expect(stripWakeWord(input)).toBe(out));

  it("detecta presença", () => {
    expect(hasWakeWord("Jarvis")).toBe(true);
    expect(hasWakeWord("o jarvis é legal")).toBe(false);
  });

  it("reconhece comandos de encerrar", () => {
    expect(isStopCommand("Obrigado Jarvis, é só isso")).toBe(true);
    expect(isStopCommand("pode parar")).toBe(true);
    expect(isStopCommand("pare de marcar reuniões às sextas")).toBe(false);
  });
});

describe("formatação", () => {
  it("moeda", () => {
    expect(formatUsd(1.5)).toBe("US$ 1,50");
    expect(formatUsd(0.0042)).toBe("US$ 0,0042");
  });
  it("tempo relativo", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(relativeTime("2026-11-03T11:58:00Z", now)).toBe("há 2 min");
    expect(relativeTime("2026-11-02T10:00:00Z", now)).toBe("ontem");
  });
});
