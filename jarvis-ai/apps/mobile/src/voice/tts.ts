/**
 * Síntese de voz.
 * - Padrão: voz nativa do iOS (expo-speech / AVSpeechSynthesizer), gratuita e offline.
 * - Opcional: voz premium do backend (ElevenLabs), tocada com expo-audio.
 *   Em qualquer falha da voz premium, cai automaticamente para a voz nativa.
 */
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { forSpeech, SentenceBuffer } from "@/logic/sentences";

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

/** Web: toca o MP3 da voz premium com o elemento <audio> do navegador. */
async function speakPremiumWeb(audio: ArrayBuffer): Promise<void> {
  const url = URL.createObjectURL(new Blob([audio], { type: "audio/mpeg" }));
  const el = new window.Audio(url);
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (currentFinish !== finish) return;
      currentFinish = null;
      el.pause();
      URL.revokeObjectURL(url);
      resolve();
    };
    currentFinish = finish;
    el.onended = finish;
    el.onerror = () => {
      finish();
    };
    el.play().catch((e) => {
      currentFinish = null;
      URL.revokeObjectURL(url);
      reject(e);
    });
  });
}

async function speakPremium(text: string): Promise<void> {
  const audio = await api.tts(text);
  if (Platform.OS === "web") return speakPremiumWeb(audio);
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

// ---------------------------------------------------------------------------
// Fase 5 — fala em streaming: cada frase é falada assim que fica completa.
// ---------------------------------------------------------------------------
export interface SpeechStream {
  /** Recebe texto parcial do Jarvis. */
  push(text: string): void;
  /** Fim do texto: fala o restante e resolve quando tudo foi dito (ou interrompido). */
  end(): Promise<void>;
  /** true depois que a primeira frase começou a ser falada. */
  readonly started: boolean;
}

/**
 * Voz nativa: frases entram na fila do AVSpeechSynthesizer. Voz premium (servidor):
 * o texto é acumulado e falado no fim (uma chamada só, para não multiplicar o custo).
 */
export function createSpeechStream(opts: SpeakOptions, onFirstSentence: () => void): SpeechStream {
  const buffer = new SentenceBuffer();
  let started = false;
  let pending = 0;
  let ended = false;
  let full = "";
  let cancelled = false;
  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((r) => (resolveDone = r));
  const checkDone = () => {
    if (ended && pending === 0) resolveDone?.();
  };

  const say = (sentence: string) => {
    const clean = forSpeech(sentence);
    if (!clean || cancelled) return;
    if (!started) {
      started = true;
      onFirstSentence();
    }
    pending++;
    const finish = () => {
      pending = Math.max(0, pending - 1);
      checkDone();
    };
    // Interrupção (toque ou voz): para tudo e ignora o texto que ainda chegar.
    currentFinish = () => {
      cancelled = true;
      pending = 0;
      ended = true;
      checkDone();
    };
    Speech.speak(clean, { language: "pt-BR", voice: opts.voiceIdentifier ?? undefined, rate: opts.rate, pitch: 0.95, onDone: finish, onStopped: finish, onError: finish });
  };

  void ensureAudioMode();
  return {
    get started() {
      return started;
    },
    push(text: string) {
      full += text;
      if (opts.premium || cancelled) return;
      for (const s of buffer.push(text)) say(s);
    },
    async end() {
      if (opts.premium) {
        if (full.trim() && !cancelled) {
          started = true;
          onFirstSentence();
          await speak(full, opts);
        }
        return;
      }
      const rest = buffer.flush();
      if (rest) say(rest);
      ended = true;
      checkDone();
      await done;
    },
  };
}
