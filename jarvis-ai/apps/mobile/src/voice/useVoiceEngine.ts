/**
 * Voice Engine: reconhecimento de fala (pt-BR) + síntese + máquina de estados.
 *
 * - Reconhecimento: expo-speech-recognition (SFSpeechRecognizer no iOS), com
 *   transcrição parcial em tempo real e medição de volume para as ondas.
 * - Detecção de fim de fala: resultado final do iOS ou ~1,6 s sem mudança no texto.
 * - Silêncio: sem fala por ~8 s conta como silêncio; dois seguidos encerram a sessão.
 * - Interrupção: tocar no orbe enquanto o Jarvis fala corta a fala e volta a ouvir.
 * - Funciona com o app em primeiro plano. Não há escuta em segundo plano.
 */
import * as Haptics from "expo-haptics";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialVoiceState, voiceReducer } from "@/logic/voiceMachine";
import { isStopCommand, stripWakeWord } from "@/logic/wakeWord";
import { speak, stopSpeaking, type SpeakOptions } from "./tts";

const END_OF_SPEECH_MS = 1600;
const NO_SPEECH_MS = 8000;

const CONTEXTUAL_STRINGS = ["Jarvis", "Sir Alfred", "Black Bear", "Barton", "Alfie & Fred", "Genesis Barber", "CODE S.O.S.", "barbearia"];

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone e do reconhecimento de fala em Ajustes > JARVIS AI.",
  "service-not-allowed": "O reconhecimento de fala está indisponível ou restrito neste aparelho.",
  "language-not-supported": "O reconhecimento em português não está disponível neste aparelho.",
  network: "Falha de rede no reconhecimento de fala.",
  "audio-capture": "Não foi possível capturar o áudio do microfone.",
  interrupted: "O áudio foi interrompido (ligação, Siri ou alarme).",
  busy: "O reconhecedor está ocupado. Tente novamente.",
};

export interface VoiceEngineOptions {
  /** Envia o texto ao Jarvis e devolve o texto a ser falado (ou null se não houver fala). */
  onUtterance: (text: string) => Promise<string | null>;
  speakReplies: boolean;
  speech: SpeakOptions;
}

export function useVoiceEngine(opts: VoiceEngineOptions) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stateRef = useRef(state);
  stateRef.current = state;

  const recognizing = useRef(false);
  const gotFinal = useRef(false);
  const lastTranscript = useRef("");
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (endTimer.current) clearTimeout(endTimer.current);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    endTimer.current = silenceTimer.current = null;
  };

  // ---- Inicia o reconhecimento a cada nova escuta ----
  useEffect(() => {
    if (state.phase !== "listening") return;
    gotFinal.current = false;
    lastTranscript.current = "";
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        contextualStrings: CONTEXTUAL_STRINGS,
        iosTaskHint: "unspecified",
        iosCategory: { category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth"], mode: "default" },
        volumeChangeEventOptions: { enabled: true, intervalMillis: 90 },
      });
      recognizing.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch (e) {
      dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "Falha ao iniciar o microfone." });
      return;
    }
    silenceTimer.current = setTimeout(() => {
      if (!lastTranscript.current) ExpoSpeechRecognitionModule.abort();
    }, NO_SPEECH_MS);
    return clearTimers;
  }, [state.listenId, state.phase]);

  // ---- Eventos do reconhecedor ----
  useSpeechRecognitionEvent("volumechange", (e) => dispatch({ type: "LEVEL", value: e.value }));

  useSpeechRecognitionEvent("result", (e) => {
    const text = e.results[0]?.transcript ?? "";
    if (e.isFinal) {
      gotFinal.current = true;
      clearTimers();
      dispatch({ type: "FINAL", text });
      return;
    }
    dispatch({ type: "PARTIAL", text });
    if (text && text !== lastTranscript.current) {
      lastTranscript.current = text;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (endTimer.current) clearTimeout(endTimer.current);
      // Pausa na fala → encerra a captura e pede o resultado final.
      endTimer.current = setTimeout(() => ExpoSpeechRecognitionModule.stop(), END_OF_SPEECH_MS);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    clearTimers();
    if (e.error === "aborted" || e.error === "no-speech" || e.error === "speech-timeout") return; // tratado em "end"
    dispatch({ type: "ERROR", message: ERROR_MESSAGES[e.error] ?? `Erro no reconhecimento de fala (${e.error}).` });
  });

  useSpeechRecognitionEvent("end", () => {
    recognizing.current = false;
    clearTimers();
    if (stateRef.current.phase !== "listening" || gotFinal.current) return;
    const partial = lastTranscript.current.trim();
    dispatch(partial ? { type: "FINAL", text: partial } : { type: "NO_SPEECH" });
  });

  // ---- Texto final → Jarvis → fala ----
  useEffect(() => {
    if (state.phase !== "listening" || !state.finalized) return;
    const raw = state.transcript;
    if (isStopCommand(raw)) {
      dispatch({ type: "STOP" });
      return;
    }
    const text = stripWakeWord(raw);
    dispatch({ type: "SUBMITTED" });
    (async () => {
      let reply: string | null;
      try {
        // Só a palavra de ativação ("Jarvis") → responde localmente, sem custo de IA.
        reply = text ? await optsRef.current.onUtterance(text) : "Pois não?";
      } catch (e) {
        dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "Falha ao falar com o Jarvis." });
        return;
      }
      const willSpeak = Boolean(reply && optsRef.current.speakReplies);
      dispatch({ type: "RESPONSE", willSpeak });
      if (willSpeak) {
        await speak(reply!, optsRef.current.speech);
        dispatch({ type: "SPEECH_DONE" });
      }
    })();
  }, [state.phase, state.finalized, state.transcript]);

  // ---- Controles ----
  const start = useCallback(async (continuous: boolean) => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      dispatch({ type: "ERROR", message: ERROR_MESSAGES["not-allowed"]! });
      return;
    }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      dispatch({ type: "ERROR", message: ERROR_MESSAGES["service-not-allowed"]! });
      return;
    }
    await stopSpeaking();
    dispatch({ type: "START", continuous });
  }, []);

  const stop = useCallback(async () => {
    clearTimers();
    if (recognizing.current) ExpoSpeechRecognitionModule.abort();
    await stopSpeaking();
    dispatch({ type: "STOP" });
  }, []);

  /** Termina a escuta atual e envia o que já foi dito. */
  const finish = useCallback(() => {
    if (recognizing.current) ExpoSpeechRecognitionModule.stop();
  }, []);

  /** Interrupção: corta a fala e volta a ouvir. */
  const interrupt = useCallback(async () => {
    await stopSpeaking();
    dispatch({ type: "INTERRUPT" });
  }, []);

  /** Fala uma resposta obtida fora do fluxo de voz (ex.: mensagem digitada). */
  const say = useCallback(async (text: string) => {
    if (!optsRef.current.speakReplies || !text) return;
    await speak(text, optsRef.current.speech);
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      ExpoSpeechRecognitionModule.abort();
      void stopSpeaking();
    },
    [],
  );

  return { state, start, stop, finish, interrupt, say };
}
