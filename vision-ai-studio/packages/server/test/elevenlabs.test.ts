import { describe, expect, it } from "vitest";
import { wordsFromAlignment } from "../src/elevenlabs";

describe("ElevenLabs", () => {
  it("agrupa tempos por caractere em palavras", () => {
    const chars = "Oi turma".split("");
    expect(
      wordsFromAlignment({
        characters: chars,
        characterStartTimesSeconds: chars.map((_, i) => i * 0.1),
        characterEndTimesSeconds: chars.map((_, i) => i * 0.1 + 0.1),
      }),
    ).toEqual([
      { text: "Oi", start: 0, end: 0.2 },
      { text: "turma", start: 0.30000000000000004, end: 0.8 },
    ]);
  });
});
