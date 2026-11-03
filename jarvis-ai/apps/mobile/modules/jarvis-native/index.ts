/**
 * Ponte JS ↔ Swift do JARVIS (Fase 3). Se o módulo nativo não existir (ex.: Expo Go,
 * web ou build antigo), tudo degrada com segurança e `available` fica false.
 */
import { requireOptionalNativeModule, type EventSubscription } from "expo";

export interface PendingIntent {
  action: "open" | "listen" | "ask";
  text?: string;
  at?: number;
}

interface NativeModuleShape {
  consumePendingIntent(): PendingIntent | null;
  setCredentials(apiUrl: string, token: string): Promise<void>;
  hasCredentials(): boolean;
  clearCredentials(): void;
  addListener(event: "onIntent", listener: (p: PendingIntent) => void): EventSubscription;
}

const Native = requireOptionalNativeModule<NativeModuleShape>("JarvisNative");

export const jarvisNative = {
  available: Native != null,
  consumePendingIntent: (): PendingIntent | null => Native?.consumePendingIntent() ?? null,
  setCredentials: async (apiUrl: string, token: string) => {
    if (!Native) throw new Error("Recurso nativo indisponível neste build. Gere um novo build do app.");
    await Native.setCredentials(apiUrl, token);
  },
  hasCredentials: (): boolean => Native?.hasCredentials() ?? false,
  clearCredentials: () => Native?.clearCredentials(),
  onIntent: (listener: (p: PendingIntent) => void): (() => void) => {
    const sub = Native?.addListener("onIntent", listener);
    return () => sub?.remove();
  },
};
