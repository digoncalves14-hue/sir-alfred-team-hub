/** Log estruturado em JSON (uma linha por evento), pronto para agregadores. */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (order[level] < min) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...sanitize(fields) });
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

function sanitize(f?: Record<string, unknown>) {
  if (!f) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (/key|secret|password|token|authorization/i.test(k)) continue;
    out[k] = v instanceof Error ? { message: v.message, name: v.name } : v;
  }
  return out;
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, f?: Record<string, unknown>) => write("debug", m, { ...base, ...f }),
      info: (m: string, f?: Record<string, unknown>) => write("info", m, { ...base, ...f }),
      warn: (m: string, f?: Record<string, unknown>) => write("warn", m, { ...base, ...f }),
      error: (m: string, f?: Record<string, unknown>) => write("error", m, { ...base, ...f }),
    };
  },
};
