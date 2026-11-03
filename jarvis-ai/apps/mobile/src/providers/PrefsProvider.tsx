/** Preferências locais do aparelho (não sensíveis), persistidas no AsyncStorage. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface Prefs {
  /** Falar as respostas em voz alta. */
  speakReplies: boolean;
  /** Voltar a ouvir automaticamente após cada resposta. */
  continuousConversation: boolean;
  /** Usar a voz premium do servidor (ElevenLabs), se configurada. */
  premiumVoice: boolean;
  /** Identificador da voz nativa do iOS (pt-BR) escolhida. */
  voiceIdentifier: string | null;
  speechRate: number;
  /** Exigir Face ID ao abrir o app. */
  biometricLock: boolean;
  /** Notificações push ativadas neste aparelho. */
  pushEnabled: boolean;
  /** Compartilhar Calendário/Lembretes do iPhone com o Jarvis (leitura). */
  deviceCalendar: boolean;
  /** Compartilhar localização aproximada (cidade) com o app aberto. */
  deviceLocation: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  speakReplies: true,
  continuousConversation: true,
  premiumVoice: false,
  voiceIdentifier: null,
  speechRate: 1.0,
  biometricLock: false,
  pushEnabled: false,
  deviceCalendar: false,
  deviceLocation: false,
};

const KEY = "jarvis.prefs.v1";

interface Ctx {
  prefs: Prefs;
  ready: boolean;
  setPrefs: (patch: Partial<Prefs>) => void;
}
const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setState({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, ready, setPrefs }), [prefs, ready, setPrefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs fora do PrefsProvider");
  return ctx;
}
