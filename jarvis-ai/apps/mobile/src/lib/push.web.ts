/** Versão web: notificações push do Jarvis exigem o app nativo (APNs). */
export type PushResult = { ok: true } | { ok: false; message: string };

export async function registerForPush(): Promise<PushResult> {
  return { ok: false, message: "Notificações push estão disponíveis só no app instalado. Na versão web, veja os avisos em Painel › Notificações." };
}

export function onNotificationTap(_handler: (url: string) => void) {
  return () => undefined;
}
