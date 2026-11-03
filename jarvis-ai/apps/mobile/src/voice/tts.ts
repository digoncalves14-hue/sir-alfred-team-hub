/**
 * Síntese de voz.
 * - Padrão: voz nativa do iOS (expo-speech / AVSpeechSynthesizer), gratuita e offline.
 * - Opcional: voz premium do backend (ElevenLabs), tocada com expo-audio.
 *   Em qualquer falha da voz premium, cai automaticamente para a voz nativa.
 */
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { api } from "@/lib/api";

export interface SpeakOptions {
  voiceIdentifier: string | null;
  rate: number;
  premium: boolean;
}

let currentPlayer: AudioPlayer | null = null;
let currentFinish: (() => void) | null = null;
let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  // Toca mesmo com a chave de silêncio ligada; não mistura com outros apps.
  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
}

/** Vozes pt-BR instaladas no aparelho (as "Aprimoradas/Premium" soam mais naturais). */
export async function listPortugueseVoices(): Promise<Speech.Voice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return voices
    .filter((v) => v.language.toLowerCase().replace("_", "-").startsWith("pt-br"))
    .sort((a, b) => (a.quality === b.quality ? a.name.localeCompare(b.name) : a.quality === "Enhanced" ? -1 : 1));
}

function speakNative(text: string, opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      currentFinish = null;
      resolve();
    };
    currentFinish = done;
    Speech.speak(text, {
      language: "pt-BR",
      voice: opts.voiceIdentifier ?? undefined,
      rate: opts.rate,
      pitch: 0.95,
      onDone: done,
      onStopped: done,
      onError: done,
    });
  });
}

async function speakPremium(text: string): Promise<void> {
  const audio = await api.tts(text);
  const file = new File(Paths.cache, `jarvis-tts-${Date.now()}.mp3`);
  file.write(new Uint8Array(audio));
  await new Promise<void>((resolve) => {
    const player = createAudioPlayer({ uri: file.uri });
    currentPlayer = player;
    const finish = () => {
      if (currentFinish !== finish) return;
      currentFinish = null;
      sub.remove();
      player.remove();
      if (currentPlayer === player) currentPlayer = null;
      try {
        file.delete();
      } catch {
        /* cache é limpo pelo sistema */
      }
      resolve();
    };
    currentFinish = finish;
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
  });
}

export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!text.trim()) return;
  await ensureAudioMode();
  await stopSpeaking();
  if (opts.premium) {
    try {
      await speakPremium(text);
      return;
    } catch {
      // Voz premium indisponível (não configurada, sem rede, limite): usa a nativa.
    }
  }
  await speakNative(text, opts);
}

/** Interrompe qualquer fala em andamento (interrupção pelo usuário). */
export async function stopSpeaking(): Promise<void> {
  const finish = currentFinish;
  if (currentPlayer) {
    try {
      currentPlayer.pause();
    } catch {
      /* já liberado */
    }
  }
  await Speech.stop().catch(() => undefined);
  finish?.();
}
