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

/**
 * Tempo máximo esperado para falar um texto. O Safari do iPhone às vezes não avisa o fim
 * da fala (ou nem começa); passado esse tempo, seguimos como se tivesse terminado.
 */
export function speechWatchdogMs(text: string, rate = 1): number {
  return Math.round(4000 + (text.length * 85) / Math.max(rate, 0.5));
}

// ---------------------------------------------------------------------------
// Web (Safari do iPhone): fala direto pelo speechSynthesis do navegador, escolhendo
// explicitamente uma voz pt-BR e "acordando" o sintetizador (o iOS às vezes o deixa pausado).
// ---------------------------------------------------------------------------
const IS_WEB = Platform.OS === "web";

function webSynth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function webVoice(identifier: string | null): SpeechSynthesisVoice | null {
  const synth = webSynth();
  if (!synth) return null;
  const voices = synth.getVoices();
  if (identifier) {
    const chosen = voices.find((v) => v.voiceURI === identifier);
    if (chosen) return chosen;
  }
  const pt = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("pt-br"));
  return pt.find((v) => v.localService) ?? pt[0] ?? null;
}

/** Fala um texto no navegador; chama onEnd ao terminar (ou em erro). */
function webSpeak(text: string, opts: SpeakOptions, onEnd: () => void) {
  const synth = webSynth();
  if (!synth) {
    onEnd();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  const voice = webVoice(opts.voiceIdentifier);
  if (voice) u.voice = voice;
  u.rate = opts.rate;
  u.pitch = 0.95;
  u.volume = 1;
  u.onend = onEnd;
  u.onerror = onEnd;
  try {
    synth.resume();
  } catch {
    /* ignore */
  }
  synth.speak(u);
}

/** Chamado num toque do usuário: libera a fala no Safari do iPhone. */
export function unlockWebSpeech() {
  const synth = webSynth();
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
    synth.resume();
  } catch {
    /* sem voz */
  }
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
  if (IS_WEB) {
    const synth = webSynth();
    return (synth?.getVoices() ?? [])
      .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("pt-br"))
      .map((v) => ({ identifier: v.voiceURI, name: v.name, language: v.lang, quality: (v.localService ? "Enhanced" : "Default") as Speech.Voice["quality"] }));
  }
  const voices = await Speech.getAvailableVoicesAsync();
  return voices
    .filter((v) => v.language.toLowerCase().replace("_", "-").startsWith("pt-br"))
    .sort((a, b) => (a.quality === b.quality ? a.name.localeCompare(b.name) : a.quality === "Enhanced" ? -1 : 1));
}

function speakNative(text: string, opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (currentFinish === done) currentFinish = null;
      resolve();
    };
    const watchdog = setTimeout(done, speechWatchdogMs(text, opts.rate));
    currentFinish = done;
    if (IS_WEB) {
      webSpeak(text, opts, done);
      return;
    }
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
  if (IS_WEB) {
    try {
      webSynth()?.cancel();
    } catch {
      /* ignore */
    }
  } else {
    await Speech.stop().catch(() => undefined);
  }
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
  let queuedChars = 0;
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
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      pending = Math.max(0, pending - 1);
      checkDone();
    };
    // As frases ficam em fila: o prazo desta conta também a fila à frente dela.
    queuedChars += clean.length;
    const watchdog = setTimeout(finish, speechWatchdogMs("x".repeat(queuedChars), opts.rate));
    // Interrupção (toque ou voz): para tudo e ignora o texto que ainda chegar.
    currentFinish = () => {
      cancelled = true;
      pending = 0;
      ended = true;
      checkDone();
    };
    if (IS_WEB) webSpeak(clean, opts, finish);
    else Speech.speak(clean, { language: "pt-BR", voice: opts.voiceIdentifier ?? undefined, rate: opts.rate, pitch: 0.95, onDone: finish, onStopped: finish, onError: finish });
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
