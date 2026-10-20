import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { getConfig } from "./config";
import { ProcessingError } from "./errors";
import { log } from "./logger";

/**
 * Integração com a ElevenLabs (trilha e narração geradas por IA). A chave fica só
 * no servidor/worker. O uso comercial do áudio gerado segue os termos do plano da
 * conta ElevenLabs configurada; o app registra isso na nota de licença do arquivo.
 */

export const AI_MUSIC_LICENSE_NOTE = "Trilha gerada por IA (ElevenLabs Music). Uso comercial conforme os termos do plano ElevenLabs da conta.";
export const AI_VOICE_LICENSE_NOTE = "Narração gerada por IA (ElevenLabs). Uso comercial conforme os termos do plano ElevenLabs da conta.";

let client: ElevenLabsClient | null = null;
function el(): ElevenLabsClient {
  const key = getConfig().ELEVENLABS_API_KEY;
  if (!key) throw new ProcessingError("not_configured", "A geração de áudio por IA não está configurada (ELEVENLABS_API_KEY).");
  client ??= new ElevenLabsClient({ apiKey: key, timeoutInSeconds: 240, maxRetries: 1 });
  return client;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Mensagem compreensível para falhas da ElevenLabs (sem expor a chave). */
export function describeElevenLabsError(err: unknown): string {
  if (err instanceof ElevenLabsError) {
    const body = err.body as { detail?: { message?: string; status?: string } | string } | undefined;
    const detail = typeof body?.detail === "string" ? body.detail : (body?.detail?.message ?? body?.detail?.status ?? err.message);
    if (err.statusCode === 401) return "A chave da ElevenLabs é inválida ou não tem permissão para este recurso.";
    if (err.statusCode === 402 || /quota|credit/i.test(String(detail))) return "A conta ElevenLabs está sem créditos suficientes.";
    if (err.statusCode === 429) return "Limite de uso da ElevenLabs atingido no momento; tente de novo em instantes.";
    return `ElevenLabs recusou o pedido (${err.statusCode ?? "erro"}: ${String(detail).slice(0, 200)}).`;
  }
  return (err as Error)?.message ?? "Falha desconhecida na ElevenLabs.";
}

/** Gera uma trilha (MP3) a partir de uma descrição. */
export async function generateMusic(prompt: string, lengthSec: number, instrumental: boolean): Promise<Buffer> {
  const ms = Math.round(Math.min(getConfig().ELEVENLABS_MAX_MUSIC_SEC, Math.max(5, lengthSec)) * 1000);
  try {
    const stream = await el().music.compose({ prompt: prompt.slice(0, 2000), musicLengthMs: ms, forceInstrumental: instrumental });
    const buf = await readAll(stream);
    if (buf.length < 1000) throw new Error("Resposta de áudio vazia.");
    return buf;
  } catch (err) {
    log.warn("elevenlabs_music_failed", { detail: describeElevenLabsError(err) });
    throw new ProcessingError("ai_music", describeElevenLabsError(err), true);
  }
}

export interface NarrationResult {
  audio: Buffer;
  /** Palavras com tempo (s) — para legendas da narração. */
  words: Array<{ text: string; start: number; end: number }>;
  voiceName: string;
}

const FALLBACK_VOICES = {
  // vozes pré-prontas multilíngues da ElevenLabs (falam português com o modelo multilíngue)
  feminina: "EXAVITQu4vr4xnSDxMaL",
  masculina: "JBFqnCBsd6RMkjVDRZzb",
} as const;

/** Escolhe uma voz em português (biblioteca da conta) do gênero pedido; senão, uma pré-pronta multilíngue. */
async function pickVoice(gender: "feminina" | "masculina"): Promise<{ id: string; name: string }> {
  try {
    const r = await el().voices.search({ pageSize: 50 });
    const wanted = gender === "feminina" ? "female" : "male";
    const pt = r.voices.filter(
      (v) => v.verifiedLanguages?.some((l) => l.language === "pt") || /portugu|brazil/i.test(`${v.labels?.language ?? ""} ${v.labels?.accent ?? ""}`),
    );
    const pick = pt.find((v) => (v.labels?.gender ?? "").toLowerCase() === wanted) ?? pt[0];
    if (pick) return { id: pick.voiceId, name: pick.name ?? pick.voiceId };
  } catch (err) {
    log.warn("elevenlabs_voice_search_failed", { detail: describeElevenLabsError(err) });
  }
  return { id: FALLBACK_VOICES[gender], name: gender === "feminina" ? "voz feminina multilíngue" : "voz masculina multilíngue" };
}

/** Narração em português com tempos por palavra. */
export async function narrate(text: string, gender: "feminina" | "masculina"): Promise<NarrationResult> {
  const voice = await pickVoice(gender);
  try {
    const r = await el().textToSpeech.convertWithTimestamps(voice.id, {
      text: text.slice(0, 2500),
      modelId: getConfig().ELEVENLABS_TTS_MODEL,
      outputFormat: "mp3_44100_128",
    });
    const audio = Buffer.from(r.audioBase64, "base64");
    if (audio.length < 1000) throw new Error("Resposta de áudio vazia.");
    return { audio, words: wordsFromAlignment(r.alignment), voiceName: voice.name };
  } catch (err) {
    log.warn("elevenlabs_tts_failed", { detail: describeElevenLabsError(err) });
    throw new ProcessingError("ai_voice", describeElevenLabsError(err), true);
  }
}

/** Agrupa os tempos por caractere em palavras. */
export function wordsFromAlignment(
  a: { characters: string[]; characterStartTimesSeconds: number[]; characterEndTimesSeconds: number[] } | undefined,
): Array<{ text: string; start: number; end: number }> {
  if (!a) return [];
  const words: Array<{ text: string; start: number; end: number }> = [];
  let cur: { text: string; start: number; end: number } | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: ch, start: a.characterStartTimesSeconds[i], end: a.characterEndTimesSeconds[i] };
    else {
      cur.text += ch;
      cur.end = a.characterEndTimesSeconds[i];
    }
  });
  if (cur) words.push(cur);
  return words;
}
