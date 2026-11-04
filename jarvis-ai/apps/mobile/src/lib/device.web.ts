/**
 * Versão web (navegador do iPhone): sem Calendário, Lembretes e Contatos do iPhone.
 * - Localização: pela API do navegador, com permissão do usuário.
 * - Ligação, SMS, WhatsApp, e-mail, Mapas e links: pelos links oficiais (o iOS abre o app).
 */
import type { DeviceAction, DeviceContext } from "@jarvis/shared";
import { buildLink, isEmail, type Channel } from "@/logic/deviceLinks";

export const WEB_DEVICE = true;

export async function requestCalendarAccess(): Promise<boolean> {
  return false;
}

function position(timeoutMs: number): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, maximumAge: 15 * 60_000, timeout: timeoutMs });
  });
}

export async function requestLocationAccess(): Promise<boolean> {
  return (await position(10_000)) !== null;
}

let locationCache: { at: number; value: NonNullable<DeviceContext["location"]> } | null = null;

export async function gatherDeviceContext(opts: { calendar: boolean; location: boolean }): Promise<DeviceContext | undefined> {
  if (!opts.location) return undefined;
  if (locationCache && Date.now() - locationCache.at < 15 * 60_000) return { location: locationCache.value };
  const pos = await position(2500);
  if (!pos) return undefined;
  // Precisão reduzida (~1 km), como no app nativo.
  const value = { city: null, region: null, latitude: Math.round(pos.coords.latitude * 100) / 100, longitude: Math.round(pos.coords.longitude * 100) / 100 };
  locationCache = { at: Date.now(), value };
  return { location: value };
}

export type Chooser = (title: string, options: string[]) => Promise<number | null>;
export interface DeviceResult {
  success: boolean;
  summary: string;
}

const CHANNEL_DONE: Record<Channel, string> = {
  ligacao: "Ligação iniciada para",
  sms: "Mensagens aberto para",
  whatsapp: "WhatsApp aberto com",
  email: "E-mail aberto para",
  mapa: "Mapas aberto em",
  link: "Link aberto:",
};

function open(url: string) {
  if (/^https?:/i.test(url)) {
    const w = window.open(url, "_blank", "noopener");
    if (!w) window.location.assign(url);
  } else {
    window.location.assign(url);
  }
}

export async function executeDeviceAction(action: DeviceAction, _choose: Chooser): Promise<DeviceResult> {
  if (action.kind !== "comunicacao") {
    return { success: false, summary: "Lembretes e eventos do iPhone só funcionam no app instalado. Na versão web, use as tarefas do Jarvis ou o Google Agenda." };
  }
  const i = action.input;
  const destino = i.destino;
  if (!destino) {
    return { success: false, summary: `A versão web não acessa seus Contatos. Diga o ${i.canal === "email" ? "e-mail" : "número"} de ${i.contato ?? "destino"}.` };
  }
  if (i.canal === "email" && !isEmail(destino)) return { success: false, summary: "E-mail inválido" };
  try {
    open(buildLink({ canal: i.canal, destino, mensagem: i.mensagem, assunto: i.assunto }));
  } catch (e) {
    return { success: false, summary: e instanceof Error ? e.message : "Destino inválido" };
  }
  const label = i.contato ?? destino;
  return { success: true, summary: `${CHANNEL_DONE[i.canal]} ${label}${["sms", "whatsapp", "email"].includes(i.canal) ? " (mensagem pronta, envio pelo usuário)" : ""}` };
}
