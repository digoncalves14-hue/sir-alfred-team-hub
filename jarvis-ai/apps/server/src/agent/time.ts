/** Utilitários de fuso horário sem dependências (Intl). */

function zonedParts(date: Date, timezone: string): Record<"year" | "month" | "day" | "hour" | "minute" | "second", number> {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** Diferença (ms) entre o horário local no fuso e o UTC, no instante dado. */
export function tzOffsetMs(date: Date, timezone: string): number {
  const p = zonedParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-04T15:00" (horário local no fuso) → instante UTC. */
export function localToUtc(local: string, timezone: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error(`Data/hora local inválida: ${local}`);
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let result = guess - tzOffsetMs(new Date(guess), timezone);
  // Segunda passada corrige transições de horário de verão.
  result = guess - tzOffsetMs(new Date(result), timezone);
  return new Date(result);
}

/** Instante → "YYYY-MM-DDTHH:mm" no fuso. */
export function toLocalIso(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Data local "YYYY-MM-DD" no fuso. */
export function localDate(date: Date, timezone: string): string {
  return toLocalIso(date, timezone).slice(0, 10);
}

/** Soma dias a uma data local "YYYY-MM-DD". */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Início do dia (00:00) no fuso informado, como instante UTC. */
export function startOfDayInTimezone(now: Date, timezone: string): Date {
  return localToUtc(localDate(now, timezone), timezone);
}

/** Formato falado: "terça, 4 de novembro, às 15:00". */
export function humanDateTime(date: Date, timezone: string, withDate = true): string {
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(date);
  if (!withDate) return time;
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(date);
  return `${day}, às ${time}`;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
