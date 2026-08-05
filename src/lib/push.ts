import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BNQy2q0UsQ_ANWNg4GomSip-KXp97YU-guE95bdC16Bciw7fKDXwdf8G4PmxdIj6RjL4lDUkKSuCnIakmqgAhEc";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** iOS só permite push quando o app está instalado na tela de início. */
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const bufToBase64Url = (buf: ArrayBuffer | null) => {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function getPushRegistration() {
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Pede permissão, assina o push e salva o aparelho no banco. */
export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error("Este aparelho/navegador não suporta notificações push.");
  if (isIOS() && !isStandalone())
    throw new Error(
      "No iPhone é preciso instalar o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abrir por lá.",
    );

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada no aparelho.");

  const reg = await getPushRegistration();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
  const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey("auth"));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh, auth },
      { onConflict: "endpoint" },
    );
  if (error) throw new Error(error.message);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
