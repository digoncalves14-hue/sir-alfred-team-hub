/**
 * Máquina de estados da conversa por voz (pura, sem dependências nativas).
 *
 * idle → listening → processing → speaking → (listening, se a sessão contínua estiver ativa) …
 * - Silêncio repetido encerra a sessão contínua.
 * - Tocar no orbe enquanto o Jarvis fala interrompe a fala e volta a ouvir.
 */
export type VoicePhase = "idle" | "listening" | "processing" | "speaking" | "error";

export interface VoiceState {
  phase: VoicePhase;
  /** Sessão contínua: após responder, volta a ouvir automaticamente. */
  sessionActive: boolean;
  /** Transcrição parcial/final da fala atual. */
  transcript: string;
  /** A fala atual terminou e o texto está pronto para envio. */
  finalized: boolean;
  /** Nível de entrada normalizado 0..1 (para animar as ondas). */
  level: number;
  silentTurns: number;
  /** Incrementa a cada nova escuta (dispara o reconhecimento no hook). */
  listenId: number;
  error: string | null;
}

export type VoiceEvent =
  | { type: "START"; continuous: boolean }
  | { type: "PARTIAL"; text: string }
  | { type: "FINAL"; text: string }
  | { type: "NO_SPEECH" }
  | { type: "LEVEL"; value: number }
  | { type: "SUBMITTED" }
  | { type: "RESPONSE"; willSpeak: boolean }
  | { type: "SPEECH_DONE" }
  | { type: "INTERRUPT" }
  | { type: "STOP" }
  | { type: "ERROR"; message: string };

export const MAX_SILENT_TURNS = 2;

export const initialVoiceState: VoiceState = {
  phase: "idle",
  sessionActive: false,
  transcript: "",
  finalized: false,
  level: 0,
  silentTurns: 0,
  listenId: 0,
  error: null,
};

const listen = (s: VoiceState, patch: Partial<VoiceState> = {}): VoiceState => ({
  ...s,
  phase: "listening",
  transcript: "",
  finalized: false,
  level: 0,
  error: null,
  listenId: s.listenId + 1,
  ...patch,
});

const rest = (s: VoiceState): VoiceState => ({ ...s, phase: "idle", sessionActive: false, level: 0, silentTurns: 0 });

/** Converte o volume do reconhecedor (-2..10) para 0..1. */
export function normalizeLevel(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(1, raw / 10);
}

export function voiceReducer(s: VoiceState, e: VoiceEvent): VoiceState {
  switch (e.type) {
    case "START":
      if (s.phase === "processing") return s;
      return listen(s, { sessionActive: e.continuous, silentTurns: 0 });
    case "PARTIAL":
      return s.phase === "listening" && !s.finalized ? { ...s, transcript: e.text } : s;
    case "FINAL": {
      if (s.phase !== "listening" || s.finalized) return s;
      const text = e.text.trim();
      if (!text) return voiceReducer(s, { type: "NO_SPEECH" });
      return { ...s, transcript: text, finalized: true, silentTurns: 0, level: 0 };
    }
    case "NO_SPEECH": {
      if (s.phase !== "listening" || s.finalized) return s;
      const silentTurns = s.silentTurns + 1;
      if (s.sessionActive && silentTurns < MAX_SILENT_TURNS) return listen(s, { silentTurns });
      return rest(s);
    }
    case "LEVEL":
      return s.phase === "listening" ? { ...s, level: normalizeLevel(e.value) } : s;
    case "SUBMITTED":
      return { ...s, phase: "processing", finalized: false, level: 0 };
    case "RESPONSE":
      if (s.phase !== "processing") return s;
      if (e.willSpeak) return { ...s, phase: "speaking" };
      return s.sessionActive ? listen(s) : rest(s);
    case "SPEECH_DONE":
      if (s.phase !== "speaking") return s;
      return s.sessionActive ? listen(s) : rest(s);
    case "INTERRUPT":
      // Interrupção do usuário durante a fala: para de falar e volta a ouvir.
      return s.phase === "speaking" ? listen(s) : s;
    case "STOP":
      return { ...rest(s), transcript: s.transcript };
    case "ERROR":
      return { ...rest(s), phase: "error", error: e.message };
  }
}
