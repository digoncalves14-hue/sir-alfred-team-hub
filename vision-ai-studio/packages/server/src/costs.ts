import { getConfig } from "./config";

export function estimateAiCost(inputTokens: number, outputTokens: number): number {
  const c = getConfig();
  return round((inputTokens * c.AI_PRICE_INPUT_PER_MTOK + outputTokens * c.AI_PRICE_OUTPUT_PER_MTOK) / 1_000_000);
}

export function estimateTranscriptionCost(durationSec: number): number {
  const c = getConfig();
  if (c.transcriptionProvider !== "openai") return 0;
  return round((durationSec / 60) * c.TRANSCRIPTION_PRICE_PER_MIN);
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
