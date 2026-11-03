/** Resumo do dia: agenda + tarefas + e-mails importantes. Determinístico (sem custo de IA). */
import type { Task, Today } from "@jarvis/shared";
import { addDays, humanDateTime, localToUtc } from "./time";
import type { GoogleUser } from "../google/gateway";
import { IntegrationError } from "../google/errors";

export async function buildDay(google: GoogleUser | null, tasks: Task[], date: string, timezone: string): Promise<Today> {
  const out: Today = {
    date,
    calendar: { connected: false, events: [], error: null },
    tasks,
    email: { connected: false, importantUnread: null, error: null },
  };
  if (google && (await google.connected("calendar"))) {
    out.calendar.connected = true;
    try {
      const cal = await google.calendar();
      const events = await cal.list(localToUtc(date, timezone), localToUtc(addDays(date, 1), timezone), timezone);
      out.calendar.events = events.map(({ startAt: _s, endAt: _e, busy: _b, ...e }) => e);
    } catch (e) {
      out.calendar.error = e instanceof IntegrationError ? e.message : "Falha ao consultar a agenda.";
    }
  }
  if (google && (await google.connected("gmail"))) {
    out.email.connected = true;
    try {
      out.email.importantUnread = await (await google.gmail()).countImportantUnread();
    } catch (e) {
      out.email.error = e instanceof IntegrationError ? e.message : "Falha ao consultar o Gmail.";
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Texto curto, adequado para notificação e para ser falado. */
export function summaryText(day: Today, ownerName: string, timezone: string, greeting = "Bom dia"): string {
  const parts: string[] = [`${greeting}, ${ownerName}.`];
  if (day.calendar.connected) {
    const timed = day.calendar.events.filter((e) => !e.allDay);
    if (day.calendar.error) parts.push("Não consegui consultar a agenda.");
    else if (day.calendar.events.length === 0) parts.push("Nenhum compromisso na agenda hoje.");
    else {
      const first = timed[0];
      const firstTxt = first ? ` O primeiro é ${first.title}, às ${humanDateTime(localToUtc(first.start, timezone), timezone, false)}.` : "";
      parts.push(`Você tem ${plural(day.calendar.events.length, "compromisso", "compromissos")} hoje.${firstTxt}`);
    }
  } else {
    parts.push("A agenda ainda não está conectada.");
  }
  const dueToday = day.tasks.filter((t) => t.dueDate && t.dueDate <= day.date);
  const overdue = day.tasks.filter((t) => t.dueDate && t.dueDate < day.date);
  if (dueToday.length > 0) {
    parts.push(`${plural(dueToday.length, "tarefa", "tarefas")} para hoje${overdue.length ? `, sendo ${plural(overdue.length, "atrasada", "atrasadas")}` : ""}.`);
  } else if (day.tasks.length > 0) {
    parts.push(`${plural(day.tasks.length, "tarefa aberta", "tarefas abertas")}, nenhuma vencendo hoje.`);
  }
  if (day.email.connected && day.email.importantUnread !== null && day.email.importantUnread > 0) {
    parts.push(`${plural(day.email.importantUnread, "e-mail importante não lido", "e-mails importantes não lidos")}.`);
  }
  return parts.join(" ");
}
