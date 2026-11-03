/**
 * Notificações push (Expo Push → APNs). O backend envia lembretes, resumo diário
 * e avisos de reunião mesmo com o app fechado.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

// Com o app aberto, mostra o aviso como banner também.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export type PushResult = { ok: true } | { ok: false; message: string };

export async function registerForPush(): Promise<PushResult> {
  if (!Device.isDevice) return { ok: false, message: "Notificações push só funcionam em um iPhone físico." };
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { ok: false, message: "Permita notificações em Ajustes › JARVIS AI › Notificações." };

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, message: "Projeto EAS não vinculado. Rode `npx eas-cli init` e gere o app de novo." };
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Device.deviceName ?? undefined);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao registrar notificações." };
  }
}

/** Ao tocar numa notificação, abre a rota indicada (ex.: jarvis://dashboard). */
export function onNotificationTap(handler: (url: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === "string") handler(url);
  });
  return () => sub.remove();
}
