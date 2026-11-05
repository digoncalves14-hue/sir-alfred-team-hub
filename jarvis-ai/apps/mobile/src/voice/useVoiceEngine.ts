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
import { Platform } from "react-native";
import { initialVoiceState, voiceReducer } from "@/logic/voiceMachine";
import { isStopCommand, stripWakeWord } from "@/logic/wakeWord";
import { diag } from "@/lib/diag";
import { createSpeechStream, speak, stopSpeaking, unlockWebSpeech, type SpeakOptions, type SpeechStream } from "./tts";

const END_OF_SPEECH_MS = 1600;
/** Depois de pedir o fim da escuta, quanto esperar pelo aviso do reconhecedor (o Safari às vezes não avisa). */
const STOP_GRACE_MS = 2500;
/** Tempo máximo esperando a resposta do Jarvis antes de liberar o orbe. */
const RESPONSE_TIMEOUT_MS = 60_000;
const NO_SPEECH_MS = 8000;

const CONTEXTUAL_STRINGS = ["Jarvis", "Sir Alfred", "Black Bear", "Barton", "Alfie & Fred", "Genesis Barber", "CODE S.O.S.", "barbearia"];

const WEB = Platform.OS === "web";
const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": WEB
    ? "Permita o microfone para este site: no Safari, toque em \"aA\" › Ajustes do Site › Microfone › Permitir."
    : "Permita o uso do microfone e do reconhecimento de fala em Ajustes > JARVIS AI.",
  "service-not-allowed": WEB
    ? "Este navegador não oferece reconhecimento de voz. Use o Safari no iPhone (com Siri e Ditado ativados) ou digite a mensagem."
    : "O reconhecimento de fala está indisponível ou restrito neste aparelho.",
  "language-not-supported": "O reconhecimento em português não está disponível neste aparelho.",
  network: "Falha de rede no reconhecimento de fala.",
  "audio-capture": "Não foi possível capturar o áudio do microfone.",
  interrupted: "O áudio foi interrompido (ligação, Siri ou alarme).",
  busy: "O reconhecedor está ocupado. Tente novamente.",
};

export interface VoiceEngineOptions {
  /**
   * Envia o texto ao Jarvis. Com `sink`, o texto em streaming deve ser empurrado nele
   * (fala frase a frase) e a função devolve null; ou devolve um texto para falar inteiro.
   */
  onUtterance: (text: string, sink: SpeechStream | null) => Promise<string | null>;
  speakReplies: boolean;
  speech: SpeakOptions;
  /** Experimental: falar por cima interrompe o Jarvis (cancelamento de eco do iOS). */
  bargeIn?: boolean;
}

export function useVoiceEngine(opts: VoiceEngineOptions) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastPhase = useRef(state.phase);
  if (lastPhase.current !== state.phase) {
    diag(`fase: ${lastPhase.current} → ${state.phase}${state.error ? ` (${state.error.slice(0, 60)})` : ""}`);
    lastPhase.current = state.phase;
  }

  const recognizing = useRef(false);
  const gotFinal = useRef(false);
  /** Web: a escuta já foi iniciada no próprio toque (exigência do Safari do iPhone). */
  const startedInGesture = useRef(false);
  const lastTranscript = useRef("");
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Escuta durante a fala do Jarvis (interrupção por voz). */
  const bargeRef = useRef(false);
  /**
   * Web, conversa contínua: um único reconhecimento contínuo, iniciado no toque, fica
   * ligado durante a conversa (o Safari não deixa religar o microfone sem novo toque).
   * Enquanto o Jarvis pensa/fala, o que o microfone ouve é ignorado (eco da própria voz).
   */
  const webSession = useRef(false);
  /** Ignora o que for ouvido até este instante (eco logo depois da fala). */
  const ignoreUntil = useRef(0);
  const ECHO_GRACE_MS = 900;

  const endWebSession = () => {
    if (!webSession.current) return;
    webSession.current = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* já parado */
    }
  };

  /** Encerra a escuta com o texto parcial quando o reconhecedor não avisa o fim. */
  const forceFinal = () => {
    if (stateRef.current.phase !== "listening" || gotFinal.current) return;
    gotFinal.current = true;
    if (!webSession.current) {
      recognizing.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* já parado */
      }
    }
    const partial = lastTranscript.current.trim();
    dispatch(partial ? { type: "FINAL", text: partial } : { type: "NO_SPEECH" });
  };

  /** Ninguém falou: encerra a escuta (e não depende do aviso do reconhecedor). */
  const giveUpIfSilent = () => {
    if (lastTranscript.current) return;
    if (webSession.current) {
      // Sessão contínua: conta um silêncio sem desligar o microfone.
      forceFinal();
      return;
    }
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      /* já parado */
    }
    endTimer.current = setTimeout(forceFinal, 1500);
  };

  /**
   * Web (Safari do iPhone): o reconhecimento precisa começar DENTRO do toque do usuário,
   * sem nenhuma espera antes. Retorna false se não foi possível.
   */
  const beginWebListening = (continuous = false): boolean => {
    const w = globalThis as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown; speechSynthesis?: { cancel(): void } };
    if (!w.webkitSpeechRecognition && !w.SpeechRecognition) {
      dispatch({ type: "ERROR", message: ERROR_MESSAGES["service-not-allowed"]! });
      return false;
    }
    // Este toque também libera a voz do Jarvis no Safari (a resposta chega depois, sem toque).
    unlockWebSpeech();
    gotFinal.current = false;
    lastTranscript.current = "";
    clearTimers();
    try {
      endWebSession();
      diag("microfone: start");
      ExpoSpeechRecognitionModule.start({ lang: "pt-BR", interimResults: true, continuous, maxAlternatives: 1 });
    } catch (e) {
      diag(`microfone: start falhou (${e instanceof Error ? e.message.slice(0, 60) : "?"})`);
      dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "Falha ao iniciar o microfone." });
      return false;
    }
    recognizing.current = true;
    startedInGesture.current = true;
    webSession.current = continuous;
    ignoreUntil.current = 0;
    return true;
  };

  const clearTimers = () => {
    if (endTimer.current) clearTimeout(endTimer.current);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    endTimer.current = silenceTimer.current = null;
  };

  // ---- Inicia o reconhecimento a cada nova escuta ----
  useEffect(() => {
    if (state.phase !== "listening") return;
    if (startedInGesture.current) {
      // Web: o reconhecimento já começou no toque; aqui só armamos os prazos.
      startedInGesture.current = false;
      silenceTimer.current = setTimeout(giveUpIfSilent, NO_SPEECH_MS);
      return clearTimers;
    }
    if (WEB) {
      if (webSession.current && recognizing.current) {
        // Conversa contínua: o microfone continua ligado; nova vez de falar.
        gotFinal.current = false;
        lastTranscript.current = "";
        ignoreUntil.current = Date.now() + ECHO_GRACE_MS;
        silenceTimer.current = setTimeout(giveUpIfSilent, NO_SPEECH_MS);
        return clearTimers;
      }
      // Sem um toque, o Safari não libera o microfone: volta ao estado inicial ("toque para falar").
      webSession.current = false;
      dispatch({ type: "STOP" });
      return;
    }
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
    silenceTimer.current = setTimeout(giveUpIfSilent, NO_SPEECH_MS);
    return clearTimers;
  }, [state.listenId, state.phase]);

  // ---- Eventos do reconhecedor ----
  useSpeechRecognitionEvent("start", () => diag("microfone: começou a ouvir"));
  useSpeechRecognitionEvent("volumechange", (e) => dispatch({ type: "LEVEL", value: e.value }));

  useSpeechRecognitionEvent("result", (e) => {
    const text = e.results[0]?.transcript ?? "";
    diag(`microfone: resultado ${e.isFinal ? "final" : "parcial"} (${text.length} letras, fase ${stateRef.current.phase})`);
    if (bargeRef.current) {
      // O usuário começou a falar enquanto o Jarvis fala → interrompe e volta a ouvir.
      if (stateRef.current.phase === "speaking" && text.trim().length >= 4) {
        bargeRef.current = false;
        ExpoSpeechRecognitionModule.abort();
        void stopSpeaking().then(() => setTimeout(() => dispatch({ type: "INTERRUPT" }), 250));
      }
      return;
    }
    if (webSession.current) {
      // Fora da vez do usuário (Jarvis pensando/falando) ou eco logo depois: ignora.
      if (stateRef.current.phase !== "listening" || stateRef.current.finalized || gotFinal.current || Date.now() < ignoreUntil.current) return;
    }
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
      endTimer.current = setTimeout(() => {
        if (webSession.current) {
          // Conversa contínua: a pausa encerra a fala sem desligar o microfone.
          forceFinal();
          return;
        }
        ExpoSpeechRecognitionModule.stop();
        // Se o reconhecedor não encerrar sozinho (Safari), envia o que já foi entendido.
        endTimer.current = setTimeout(forceFinal, STOP_GRACE_MS);
      }, END_OF_SPEECH_MS);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    diag(`microfone: erro ${e.error}`);
    clearTimers();
    if (bargeRef.current || stateRef.current.phase === "speaking") return; // escuta de interrupção: erros são silenciosos
    if (e.error === "aborted" || e.error === "no-speech" || e.error === "speech-timeout") return; // tratado em "end"
    dispatch({ type: "ERROR", message: ERROR_MESSAGES[e.error] ?? `Erro no reconhecimento de fala (${e.error}).` });
  });

  useSpeechRecognitionEvent("end", () => {
    diag(`microfone: end (fase ${stateRef.current.phase})`);
    recognizing.current = false;
    // O Safari encerrou o microfone (tempo máximo, interrupção): a sessão acaba; novo toque religa.
    webSession.current = false;
    clearTimers();
    if (stateRef.current.phase !== "listening" || gotFinal.current) return;
    const partial = lastTranscript.current.trim();
    dispatch(partial ? { type: "FINAL", text: partial } : { type: "NO_SPEECH" });
  });

  // ---- Interrupção por voz (experimental): ouve enquanto o Jarvis fala ----
  useEffect(() => {
    if (state.phase !== "speaking" || !optsRef.current.bargeIn) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "pt-BR",
        interimResults: true,
        continuous: true,
        addsPunctuation: false,
        // Cancelamento de eco: evita que o Jarvis "ouça" a própria voz.
        iosVoiceProcessingEnabled: true,
        iosCategory: { category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth"], mode: "voiceChat" },
      });
      bargeRef.current = true;
    } catch {
      bargeRef.current = false;
    }
    return () => {
      if (bargeRef.current) {
        bargeRef.current = false;
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [state.phase]);

  // ---- Texto final → Jarvis → fala ----
  useEffect(() => {
    if (state.phase !== "listening" || !state.finalized) return;
    const raw = state.transcript;
    if (isStopCommand(raw)) {
      dispatch({ type: "STOP" });
      return;
    }
    const text = stripWakeWord(raw);
    diag(`enviando pergunta (${text.length} letras)`);
    dispatch({ type: "SUBMITTED" });
    (async () => {
      // Fala em streaming: a 1ª frase completa já passa o estado para "falando".
      const sink = optsRef.current.speakReplies
        ? createSpeechStream(optsRef.current.speech, () => dispatch({ type: "RESPONSE", willSpeak: true }))
        : null;
      let reply: string | null;
      try {
        // Só a palavra de ativação ("Jarvis") → responde localmente, sem custo de IA.
        reply = text
          ? await Promise.race([
              optsRef.current.onUtterance(text, sink),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("O Jarvis demorou demais para responder. Toque no orbe e tente de novo.")), RESPONSE_TIMEOUT_MS),
              ),
            ])
          : "Pois não?";
      } catch (e) {
        diag(`erro na resposta: ${e instanceof Error ? e.message.slice(0, 80) : "?"}`);
        dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "Falha ao falar com o Jarvis." });
        return;
      }
      if (!sink) {
        dispatch({ type: "RESPONSE", willSpeak: false });
        return;
      }
      diag("resposta recebida; falando");
      if (reply) sink.push(reply);
      await sink.end();
      diag(`fala concluída (começou: ${sink.started})`);
      dispatch(sink.started ? { type: "SPEECH_DONE" } : { type: "RESPONSE", willSpeak: false });
    })();
  }, [state.phase, state.finalized, state.transcript]);

  // ---- Controles ----
  const start = useCallback(async (continuous: boolean) => {
    if (WEB) {
      // Nada de await antes do start(): o Safari exige o toque "ao vivo".
      // Conversa contínua fica desligada na web: no iPhone, quando a voz do Jarvis toca,
      // o Safari desliga o microfone do site e só o religa com um novo toque.
      if (!beginWebListening(false)) return;
      void stopSpeaking();
      dispatch({ type: "START", continuous: false });
      return;
    }
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

  // Web: a conversa terminou (silêncio, "pode parar", erro) → desliga o microfone.
  useEffect(() => {
    if ((state.phase === "idle" || state.phase === "error") && webSession.current) endWebSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const stop = useCallback(async () => {
    clearTimers();
    webSession.current = false;
    if (recognizing.current) ExpoSpeechRecognitionModule.abort();
    await stopSpeaking();
    dispatch({ type: "STOP" });
  }, []);

  /** Termina a escuta atual e envia o que já foi dito. */
  const finish = useCallback(() => {
    if (webSession.current) {
      // Sessão contínua: envia o que já foi dito sem desligar o microfone.
      clearTimers();
      forceFinal();
      return;
    }
    if (recognizing.current) ExpoSpeechRecognitionModule.stop();
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(forceFinal, STOP_GRACE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Interrupção: corta a fala e volta a ouvir. */
  const interrupt = useCallback(async () => {
    if (WEB) {
      if (webSession.current && recognizing.current) {
        // Microfone já ligado (conversa contínua): só corta a fala e volta a ouvir.
        void stopSpeaking();
        dispatch({ type: "INTERRUPT" });
        return;
      }
      if (!beginWebListening(false)) return;
      void stopSpeaking();
      dispatch({ type: "INTERRUPT" });
      return;
    }
    await stopSpeaking();
    dispatch({ type: "INTERRUPT" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
