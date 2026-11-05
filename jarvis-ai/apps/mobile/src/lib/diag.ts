/**
 * Diagnóstico leve da versão web: anota eventos da voz (estados do orbe, microfone,
 * reprodução) e envia em lote ao servidor, que registra nos logs. Não envia áudio
 * nem o texto falado — só nomes de eventos e tempos.
 */
import { Platform } from "react-native";
import { config } from "./config";
import { supabase } from "./supabase";

const buffer: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const t0 = Date.now();

export function diag(event: string) {
  if (Platform.OS !== "web") return;
  buffer.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${event}`.slice(0, 160));
  if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
  timer ??= setTimeout(flush, 3000);
}

async function flush() {
  timer = null;
  if (!buffer.length) return;
  const events = buffer.splice(0, 50);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`${config.apiUrl}/v1/diag`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ events, ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 160) : "" }),
      keepalive: true,
    });
  } catch {
    /* diagnóstico é opcional */
  }
  if (buffer.length) timer = setTimeout(flush, 1000);
}
