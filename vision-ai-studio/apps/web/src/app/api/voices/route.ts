import { capabilities, listVoices } from "@vision/server";
import { HttpError, api, json } from "@/lib/api";

/** Vozes da ElevenLabs para a narração (nome, gênero, amostra de áudio). */
export const GET = api(async () => {
  if (!capabilities().tts) throw new HttpError(501, "A narração por IA não está configurada (ELEVENLABS_API_KEY).");
  try {
    return json({ voices: await listVoices() });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
