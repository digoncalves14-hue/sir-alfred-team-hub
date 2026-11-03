/**
 * Simulação em memória das APIs do Google (OAuth, Calendar, Gmail) e do Expo Push,
 * usada SOMENTE nos testes para exercitar os clientes reais via `fetch`.
 */
import { localToUtc } from "../src/agent/time";

interface Ev {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  attendees?: { email: string }[];
  status?: string;
}

interface Msg {
  id: string;
  threadId: string;
  labelIds: string[];
  from: string;
  subject: string;
  body: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export class FakeGoogle {
  events: Ev[] = [];
  messages: Msg[] = [];
  sent: { raw: string; threadId?: string }[] = [];
  drafts: { raw: string; threadId?: string }[] = [];
  calls: { method: string; url: string; body?: string }[] = [];
  pushes: unknown[] = [];
  pushError: string | null = null;
  grantedScope = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose";
  refreshRevoked = false;
  omitRefreshToken = false;
  revoked: string[] = [];
  /** Planilhas simuladas: id → título e abas. */
  spreadsheets = new Map<string, { title: string; tabs: { name: string; values: string[][] }[] }>();
  private seq = 0;

  get mutations() {
    return this.calls.filter((c) => c.method !== "GET" && /googleapis\.com\/(calendar|gmail)/.test(c.url));
  }

  addEvent(summary: string, startLocal: string, endLocal: string, tz = "America/Sao_Paulo", extra: Partial<Ev> = {}) {
    const ev: Ev = {
      id: `ev${++this.seq}`,
      summary,
      start: { dateTime: localToUtc(startLocal, tz).toISOString() },
      end: { dateTime: localToUtc(endLocal, tz).toISOString() },
      ...extra,
    };
    this.events.push(ev);
    return ev;
  }

  addMessage(from: string, subject: string, body: string, labels = ["UNREAD", "IMPORTANT", "INBOX"]) {
    const m: Msg = { id: `msg${++this.seq}`, threadId: `th${this.seq}`, labelIds: labels, from, subject, body };
    this.messages.push(m);
    return m;
  }

  fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined;
    this.calls.push({ method, url: url.toString(), body });

    // ---- OAuth ----
    if (url.href === "https://oauth2.googleapis.com/token") {
      const p = new URLSearchParams(body);
      if (p.get("grant_type") === "authorization_code") {
        if (p.get("code") === "bad") return json({ error: "invalid_grant" }, 400);
        if (!p.get("code_verifier")) return json({ error: "invalid_request" }, 400);
        return json({
          access_token: "at-1",
          expires_in: 3600,
          scope: this.grantedScope,
          ...(this.omitRefreshToken ? {} : { refresh_token: "rt-secret-123" }),
        });
      }
      if (this.refreshRevoked) return json({ error: "invalid_grant" }, 400);
      return json({ access_token: `at-${++this.seq}`, expires_in: 3600 });
    }
    if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) {
      this.revoked.push(url.searchParams.get("token") ?? "");
      return new Response(null, { status: 200 });
    }
    if (url.href === "https://openidconnect.googleapis.com/v1/userinfo") return json({ email: "dono@exemplo.com" });

    // ---- Calendar ----
    const cal = url.pathname.match(/^\/calendar\/v3\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if (url.host === "www.googleapis.com" && cal) {
      const id = cal[1] ? decodeURIComponent(cal[1]) : null;
      if (!id && method === "GET") {
        const min = new Date(url.searchParams.get("timeMin")!);
        const max = new Date(url.searchParams.get("timeMax")!);
        const items = this.events
          .filter((e) => new Date(e.start.dateTime ?? `${e.start.date}T00:00:00Z`) < max && new Date(e.end.dateTime ?? `${e.end.date}T00:00:00Z`) > min)
          .sort((a, b) => (a.start.dateTime ?? "").localeCompare(b.start.dateTime ?? ""));
        return json({ items });
      }
      if (!id && method === "POST") {
        const req = JSON.parse(body!);
        const ev: Ev = {
          id: `ev${++this.seq}`,
          summary: req.summary,
          location: req.location,
          attendees: req.attendees,
          start: { dateTime: localToUtc(req.start.dateTime.slice(0, 16), req.start.timeZone).toISOString() },
          end: { dateTime: localToUtc(req.end.dateTime.slice(0, 16), req.end.timeZone).toISOString() },
        };
        this.events.push(ev);
        return json({ ...ev, htmlLink: `https://calendar.google.com/event?eid=${ev.id}` });
      }
      const ev = this.events.find((e) => e.id === id);
      if (!ev) return json({ error: { message: "Not Found" } }, 404);
      if (method === "GET") return json(ev);
      if (method === "PATCH") {
        const req = JSON.parse(body!);
        ev.start = { dateTime: localToUtc(req.start.dateTime.slice(0, 16), req.start.timeZone).toISOString() };
        ev.end = { dateTime: localToUtc(req.end.dateTime.slice(0, 16), req.end.timeZone).toISOString() };
        return json(ev);
      }
      if (method === "DELETE") {
        this.events = this.events.filter((e) => e.id !== id);
        return new Response(null, { status: 204 });
      }
    }

    // ---- Gmail ----
    if (url.host === "gmail.googleapis.com") {
      const path = url.pathname.replace("/gmail/v1/users/me", "");
      if (path === "/messages" && method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const list = this.messages.filter((m) => (!q.includes("is:unread") || m.labelIds.includes("UNREAD")) && (!q.includes("is:important") || m.labelIds.includes("IMPORTANT")));
        return json({ messages: list.map((m) => ({ id: m.id, threadId: m.threadId })) });
      }
      const msg = path.match(/^\/messages\/([^/]+)$/);
      if (msg && method === "GET") {
        const m = this.messages.find((x) => x.id === msg[1]);
        if (!m) return json({ error: { message: "Not Found" } }, 404);
        return json({
          id: m.id,
          threadId: m.threadId,
          labelIds: m.labelIds,
          snippet: m.body.slice(0, 80),
          payload: {
            mimeType: "multipart/alternative",
            headers: [
              { name: "From", value: m.from },
              { name: "To", value: "dono@exemplo.com" },
              { name: "Subject", value: m.subject },
              { name: "Date", value: "Tue, 3 Nov 2026 10:00:00 -0300" },
              { name: "Message-ID", value: `<${m.id}@mail.exemplo.com>` },
            ],
            parts: [{ mimeType: "text/html", body: { data: b64url(`<p>${m.body}</p>`) } }],
          },
        });
      }
      if (path === "/messages/send" && method === "POST") {
        const req = JSON.parse(body!);
        this.sent.push(req);
        return json({ id: `sent${++this.seq}` });
      }
      if (path === "/drafts" && method === "POST") {
        const req = JSON.parse(body!);
        this.drafts.push(req.message);
        return json({ id: `draft${++this.seq}` });
      }
    }

    // ---- Google Sheets ----
    if (url.host === "sheets.googleapis.com") {
      const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/]+)(?:\/values\/(.+))?$/);
      const sheet = m ? this.spreadsheets.get(decodeURIComponent(m[1]!)) : undefined;
      if (!m || !sheet) return json({ error: { message: "Requested entity was not found." } }, 404);
      if (!m[2]) return json({ properties: { title: sheet.title }, sheets: sheet.tabs.map((t) => ({ properties: { title: t.name } })) });
      const range = decodeURIComponent(m[2]);
      const tabName = range.includes("!") ? range.split("!")[0]!.replace(/^'|'$/g, "").replace(/''/g, "'") : sheet.tabs[0]!.name;
      const tab = sheet.tabs.find((t) => t.name === tabName);
      if (!tab) return json({ error: { message: `Unable to parse range: ${range}` } }, 400);
      return json({ range, majorDimension: "ROWS", values: tab.values });
    }

    // ---- Expo Push ----
    if (url.href === "https://exp.host/--/api/v2/push/send") {
      const msgs = JSON.parse(body!) as unknown[];
      this.pushes.push(...msgs);
      return json({
        data: msgs.map(() => (this.pushError ? { status: "error", details: { error: this.pushError } } : { status: "ok", id: `t${++this.seq}` })),
      });
    }

    return json({ error: { message: `rota não simulada: ${method} ${url}` } }, 599);
  }) as typeof fetch;
}

export function decodeRaw(raw: string): string {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const [head, b] = mime.split("\r\n\r\n");
  const headers = head!.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));
  return `${headers}\n\n${Buffer.from(b!.replace(/\r\n/g, ""), "base64").toString("utf8")}`;
}

/** Simulação do Sir Alfred Team Hub: Supabase como servidor OAuth 2.1 (rotação de refresh token) + PostgREST. */
export class FakeHub {
  readonly base = "https://hub-teste.supabase.co";
  tables: Record<string, unknown[]> = { performance_snapshots: [], product_sales_snapshots: [], client_reviews: [] };
  validRefresh = new Set<string>();
  validAccess = new Set<string>();
  calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  private seq = 0;

  fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    this.calls.push({ method, url: url.toString(), headers });
    if (url.pathname === "/auth/v1/oauth/token") {
      const p = new URLSearchParams(String(init.body));
      if (p.get("client_id") !== "jarvis-client") return json({ error: "invalid_client" }, 401);
      if (p.get("grant_type") === "authorization_code") {
        if (p.get("code") !== "hub-code" || !p.get("code_verifier") || p.get("redirect_uri") !== "jarvis://hub-oauth") return json({ error: "invalid_grant" }, 400);
      } else if (p.get("grant_type") === "refresh_token") {
        const rt = p.get("refresh_token")!;
        if (!this.validRefresh.has(rt)) return json({ error: "invalid_grant" }, 400);
        this.validRefresh.delete(rt); // rotação: o token antigo deixa de valer
      } else return json({ error: "unsupported_grant_type" }, 400);
      const access = `hub-at-${++this.seq}`;
      const refresh = `hub-rt-${this.seq}`;
      this.validAccess.add(access);
      this.validRefresh.add(refresh);
      return json({ access_token: access, refresh_token: refresh, expires_in: 3600, token_type: "bearer" });
    }
    if (url.pathname === "/auth/v1/oauth/userinfo") return json({ sub: "u", email: "dono@siralfred.com" });
    const rest = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (rest) {
      const token = (headers.authorization ?? "").replace("Bearer ", "");
      if (!headers.apikey) return json({ message: "No API key" }, 401);
      if (!this.validAccess.has(token)) return json({ message: "JWT expired" }, 401);
      return json(this.tables[rest[1]!] ?? []);
    }
    return json({ error: "rota não simulada" }, 599);
  }) as typeof fetch;
}
