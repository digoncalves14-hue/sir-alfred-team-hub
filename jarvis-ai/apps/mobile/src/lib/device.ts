/**
 * Recursos nativos do iPhone (Fase 3), usando as APIs do Expo SDK 58:
 *  - Leitura (com permissão): Calendário, Lembretes e localização aproximada → contexto do Jarvis.
 *  - Execução de ações CONFIRMADAS: lembrete/evento no iPhone, ligação, SMS, WhatsApp, e-mail, Mapas, link.
 * Contatos e dados do calendário ficam no aparelho; só o necessário vai na conversa.
 */
import type { DeviceAction, DeviceContext } from "@jarvis/shared";
import * as Calendar from "expo-calendar";
import { Contact, ContactField, requestPermissionsAsync as requestContactsPermission } from "expo-contacts";
import * as Location from "expo-location";
import { Linking } from "react-native";
import { buildLink, isEmail, pickContactsByName, type Channel } from "@/logic/deviceLinks";

const pad = (n: number) => String(n).padStart(2, "0");
/** Data/hora LOCAL do aparelho no formato AAAA-MM-DDTHH:MM. */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** "2026-11-05T09:00" → Date no fuso do aparelho. */
export function parseLocal(s: string): Date {
  const [d, t = "00:00"] = s.split("T");
  const [y, m, day] = d!.split("-").map(Number) as [number, number, number];
  const [h, min] = t.split(":").map(Number) as [number, number];
  return new Date(y, m - 1, day, h, min);
}
const toDate = (v: string | Date | undefined | null) => (v ? (v instanceof Date ? v : new Date(v)) : null);

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

// ---------------------------------------------------------------------------
// Permissões (pedidas quando o usuário ativa em Ajustes)
// ---------------------------------------------------------------------------
export async function requestCalendarAccess(): Promise<boolean> {
  const cal = await Calendar.requestCalendarPermissions();
  const rem = await Calendar.requestRemindersPermissions();
  return cal.granted || rem.granted;
}

export async function requestLocationAccess(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

// ---------------------------------------------------------------------------
// Contexto do aparelho (somente leitura)
// ---------------------------------------------------------------------------
let locationCache: { at: number; value: NonNullable<DeviceContext["location"]> } | null = null;

async function readCalendar(): Promise<DeviceContext["calendar"]> {
  if (!(await Calendar.getCalendarPermissions()).granted) return undefined;
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const names = new Map(calendars.map((c) => [c.id, c.title]));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 86_400_000);
  const events = await Calendar.listEvents(calendars, start, end);
  return events
    .map((e) => ({ e, s: toDate(e.startDate)!, f: toDate(e.endDate)! }))
    .sort((a, b) => a.s.getTime() - b.s.getTime())
    .slice(0, 40)
    .map(({ e, s, f }) => ({
      title: (e.title || "(sem título)").slice(0, 200),
      start: e.allDay ? localIso(s).slice(0, 10) : localIso(s),
      end: e.allDay ? localIso(f).slice(0, 10) : localIso(f),
      allDay: Boolean(e.allDay),
      calendar: names.get(e.calendarId)?.slice(0, 100),
    }));
}

async function readReminders(): Promise<DeviceContext["reminders"]> {
  if (!(await Calendar.getRemindersPermissions()).granted) return undefined;
  const lists = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
  const horizon = Date.now() + 7 * 86_400_000;
  const all = (
    await Promise.all(
      lists.map(async (l) => (await l.listReminders(null, null, Calendar.ReminderStatus.INCOMPLETE)).map((r) => ({ r, list: l.title }))),
    )
  ).flat();
  return all
    .filter(({ r }) => !r.dueDate || toDate(r.dueDate)!.getTime() <= horizon)
    .sort((a, b) => (toDate(a.r.dueDate)?.getTime() ?? Infinity) - (toDate(b.r.dueDate)?.getTime() ?? Infinity))
    .slice(0, 40)
    .map(({ r, list }) => ({ title: (r.title || "(sem título)").slice(0, 300), due: r.dueDate ? localIso(toDate(r.dueDate)!) : null, list: list?.slice(0, 100) }));
}

async function readLocation(): Promise<DeviceContext["location"]> {
  if (locationCache && Date.now() - locationCache.at < 10 * 60_000) return locationCache.value;
  if (!(await Location.getForegroundPermissionsAsync()).granted) return undefined;
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const { latitude, longitude } = pos.coords;
  const [place] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
  // Arredonda (~1 km): o Jarvis não precisa do endereço exato.
  const value = {
    city: place?.city ?? place?.subregion ?? null,
    region: place?.region ?? null,
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100,
  };
  locationCache = { at: Date.now(), value };
  return value;
}

/** Junta o contexto habilitado em Ajustes; nunca atrasa a conversa mais que ~2,5 s. */
export async function gatherDeviceContext(opts: { calendar: boolean; location: boolean }): Promise<DeviceContext | undefined> {
  if (!opts.calendar && !opts.location) return undefined;
  const safe = <T>(p: Promise<T>) => withTimeout(p.catch(() => undefined), 2500);
  const [calendar, reminders, location] = await Promise.all([
    opts.calendar ? safe(readCalendar()) : undefined,
    opts.calendar ? safe(readReminders()) : undefined,
    opts.location ? safe(readLocation()) : undefined,
  ]);
  const ctx: DeviceContext = {};
  if (calendar) ctx.calendar = calendar;
  if (reminders) ctx.reminders = reminders;
  if (location) ctx.location = location;
  return Object.keys(ctx).length ? ctx : undefined;
}

// ---------------------------------------------------------------------------
// Execução de ações confirmadas
// ---------------------------------------------------------------------------
export type Chooser = (title: string, options: string[]) => Promise<number | null>;
export interface DeviceResult {
  success: boolean;
  summary: string;
}

async function createReminder(i: Extract<DeviceAction, { kind: "lembrete_iphone" }>["input"]): Promise<DeviceResult> {
  if (!(await Calendar.requestRemindersPermissions()).granted) return { success: false, summary: "Sem permissão para acessar o app Lembretes" };
  const lists = (await Calendar.getCalendars(Calendar.EntityTypes.REMINDER)).filter((l) => l.allowsModifications);
  const list = lists.find((l) => l.isPrimary) ?? lists[0];
  if (!list) return { success: false, summary: "Nenhuma lista de Lembretes disponível para escrita" };
  const due = i.dataHora ? parseLocal(i.dataHora) : undefined;
  const created = await list.createReminder({
    title: i.titulo,
    notes: i.notas,
    ...(due ? { startDate: due, dueDate: due, alarms: [{ relativeOffset: 0 }] } : {}),
  });
  if (!created?.id) return { success: false, summary: "O iPhone não confirmou a criação do lembrete" };
  return { success: true, summary: `Lembrete "${i.titulo}" criado na lista ${list.title}${due ? ` para ${due.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}` };
}

async function createEvent(i: Extract<DeviceAction, { kind: "evento_iphone" }>["input"]): Promise<DeviceResult> {
  if (!(await Calendar.requestCalendarPermissions()).granted) return { success: false, summary: "Sem permissão para acessar o Calendário" };
  let cal: Calendar.ExpoCalendar;
  try {
    cal = Calendar.getDefaultCalendarSync();
  } catch {
    const writable = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter((c) => c.allowsModifications);
    if (!writable[0]) return { success: false, summary: "Nenhum calendário disponível para escrita" };
    cal = writable[0];
  }
  const start = parseLocal(i.inicio);
  const end = new Date(start.getTime() + i.duracaoMin * 60_000);
  const ev = await cal.createEvent({ title: i.titulo, startDate: start, endDate: end, location: i.local });
  if (!ev?.id) return { success: false, summary: "O iPhone não confirmou a criação do evento" };
  return { success: true, summary: `Evento "${i.titulo}" criado no calendário ${cal.title} em ${start.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` };
}

const CHANNEL_DONE: Record<Channel, string> = {
  ligacao: "Ligação iniciada para",
  sms: "Mensagens aberto para",
  whatsapp: "WhatsApp aberto com",
  email: "E-mail aberto para",
  mapa: "Mapas aberto em",
  link: "Link aberto:",
};

async function resolveContact(name: string, wantEmail: boolean, choose: Chooser): Promise<{ label: string; value: string } | DeviceResult> {
  if (!(await requestContactsPermission()).granted) return { success: false, summary: "Sem permissão para acessar os Contatos" };
  const raw = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS] as const, { name, limit: 20 });
  const people = raw.map((c) => ({
    name: c.fullName ?? "",
    values: wantEmail ? (c.emails ?? []).map((e) => e.address ?? "").filter(Boolean) : (c.phones ?? []).map((p) => p.number ?? "").filter(Boolean),
  }));
  const matches = pickContactsByName(people, name).filter((p) => p.values.length > 0);
  if (matches.length === 0) return { success: false, summary: `Não encontrei ${wantEmail ? "e-mail" : "telefone"} para "${name}" nos Contatos` };
  const options = matches.flatMap((p) => p.values.map((v) => ({ label: `${p.name} — ${v}`, name: p.name, value: v }))).slice(0, 6);
  if (options.length === 1) return { label: options[0]!.name, value: options[0]!.value };
  const idx = await choose(`Qual ${wantEmail ? "e-mail" : "número"} de ${name}?`, options.map((o) => o.label));
  if (idx === null) return { success: false, summary: "Cancelado: nenhum contato escolhido" };
  return { label: options[idx]!.name, value: options[idx]!.value };
}

async function communicate(i: Extract<DeviceAction, { kind: "comunicacao" }>["input"], choose: Chooser): Promise<DeviceResult> {
  let destino = i.destino;
  let label = i.contato ?? i.destino ?? "";
  if (!destino && i.contato) {
    const r = await resolveContact(i.contato, i.canal === "email", choose);
    if ("success" in r) return r;
    destino = r.value;
    label = r.label;
  }
  if (!destino) return { success: false, summary: "Destino não informado" };
  if (i.canal === "email" && !isEmail(destino)) return { success: false, summary: "E-mail inválido" };
  let url: string;
  try {
    url = buildLink({ canal: i.canal, destino, mensagem: i.mensagem, assunto: i.assunto });
  } catch (e) {
    return { success: false, summary: e instanceof Error ? e.message : "Destino inválido" };
  }
  try {
    await Linking.openURL(url);
  } catch {
    return { success: false, summary: i.canal === "whatsapp" ? "Não foi possível abrir o WhatsApp" : "O iPhone não conseguiu abrir o destino" };
  }
  return { success: true, summary: `${CHANNEL_DONE[i.canal]} ${label}${["sms", "whatsapp", "email"].includes(i.canal) ? " (mensagem pronta, envio pelo usuário)" : ""}` };
}

/** Executa a ação no iPhone. Retorna o resultado REAL, que é reportado ao servidor. */
export async function executeDeviceAction(action: DeviceAction, choose: Chooser): Promise<DeviceResult> {
  try {
    switch (action.kind) {
      case "lembrete_iphone":
        return await createReminder(action.input);
      case "evento_iphone":
        return await createEvent(action.input);
      case "comunicacao":
        return await communicate(action.input, choose);
    }
  } catch (e) {
    return { success: false, summary: e instanceof Error ? e.message.slice(0, 200) : "Erro no iPhone" };
  }
}
