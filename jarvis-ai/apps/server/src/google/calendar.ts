/** Google Calendar API v3 (agenda principal). */
import type { CalendarEvent } from "@jarvis/shared";
import { toLocalIso } from "../agent/time";
import type { GoogleFetch } from "./gateway";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface RawEvent {
  id: string;
  summary?: string;
  status?: string;
  transparency?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export interface EventWithInstants extends CalendarEvent {
  startAt: Date;
  endAt: Date;
  busy: boolean;
}

export function parseEvent(raw: RawEvent, timezone: string): EventWithInstants {
  const allDay = !raw.start?.dateTime;
  const startAt = raw.start?.dateTime ? new Date(raw.start.dateTime) : new Date(`${raw.start?.date}T00:00:00Z`);
  const endAt = raw.end?.dateTime ? new Date(raw.end.dateTime) : new Date(`${raw.end?.date ?? raw.start?.date}T00:00:00Z`);
  const declined = raw.attendees?.some((a) => a.self && a.responseStatus === "declined") ?? false;
  return {
    id: raw.id,
    title: raw.summary?.trim() || "(sem título)",
    start: allDay ? String(raw.start?.date) : toLocalIso(startAt, timezone),
    end: allDay ? String(raw.end?.date ?? raw.start?.date) : toLocalIso(endAt, timezone),
    allDay,
    location: raw.location ?? null,
    link: raw.htmlLink ?? null,
    startAt,
    endAt,
    busy: !allDay && raw.transparency !== "transparent" && raw.status !== "cancelled" && !declined,
  };
}

/** Eventos ocupados que se sobrepõem ao intervalo [start, end). */
export function findConflicts(events: EventWithInstants[], start: Date, end: Date, ignoreId?: string): EventWithInstants[] {
  return events.filter((e) => e.busy && e.id !== ignoreId && e.startAt < end && e.endAt > start);
}

export interface NewEvent {
  title: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  location?: string;
  description?: string;
  attendees?: string[];
}

export class CalendarApi {
  constructor(private readonly request: GoogleFetch) {}

  async list(timeMin: Date, timeMax: Date, timezone: string, max = 50): Promise<EventWithInstants[]> {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(max),
      timeZone: timezone,
    });
    const body = (await this.request(`${BASE}?${params}`)) as { items?: RawEvent[] };
    return (body.items ?? []).filter((e) => e.status !== "cancelled").map((e) => parseEvent(e, timezone));
  }

  async get(id: string, timezone: string): Promise<EventWithInstants> {
    return parseEvent((await this.request(`${BASE}/${encodeURIComponent(id)}`)) as RawEvent, timezone);
  }

  async create(ev: NewEvent): Promise<EventWithInstants> {
    const hasGuests = (ev.attendees?.length ?? 0) > 0;
    const body = {
      summary: ev.title,
      location: ev.location,
      description: ev.description,
      start: { dateTime: `${ev.startLocal}:00`.slice(0, 19), timeZone: ev.timezone },
      end: { dateTime: `${ev.endLocal}:00`.slice(0, 19), timeZone: ev.timezone },
      attendees: ev.attendees?.map((email) => ({ email })),
    };
    // Convites só são enviados por e-mail quando há convidados (ação já confirmada pelo usuário).
    const created = (await this.request(`${BASE}?sendUpdates=${hasGuests ? "all" : "none"}`, { method: "POST", body: JSON.stringify(body) })) as RawEvent;
    return parseEvent(created, ev.timezone);
  }

  async reschedule(id: string, startLocal: string, endLocal: string, timezone: string): Promise<EventWithInstants> {
    const body = {
      start: { dateTime: `${startLocal}:00`.slice(0, 19), timeZone: timezone },
      end: { dateTime: `${endLocal}:00`.slice(0, 19), timeZone: timezone },
    };
    const updated = (await this.request(`${BASE}/${encodeURIComponent(id)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify(body) })) as RawEvent;
    return parseEvent(updated, timezone);
  }

  async remove(id: string): Promise<void> {
    await this.request(`${BASE}/${encodeURIComponent(id)}?sendUpdates=all`, { method: "DELETE" });
  }
}
