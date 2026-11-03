/** Gmail API v1: busca, leitura, rascunhos e envio. Nunca exclui e-mails. */
import type { GoogleFetch } from "./gateway";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface RawHeader {
  name: string;
  value: string;
}
interface RawPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPart[];
  headers?: RawHeader[];
}
interface RawMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: RawPart;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  important: boolean;
}

export interface EmailFull extends EmailSummary {
  to: string;
  messageId: string | null;
  references: string | null;
  body: string;
}

const header = (m: RawMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Extrai o texto do corpo (prefere text/plain; usa HTML convertido como alternativa). */
export function extractBody(part: RawPart | undefined): string {
  if (!part) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: RawPart) => {
    if (p.mimeType === "text/plain" && p.body?.data) plain.push(decodeBase64Url(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(decodeBase64Url(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plain.length) return plain.join("\n").trim();
  return html.map(htmlToText).join("\n").trim();
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(e);
}

/** Monta a mensagem RFC 2822 (UTF-8) codificada em base64url para a API. */
export function buildRawEmail(m: { to: string[]; subject: string; body: string; inReplyTo?: string | null; references?: string | null }): string {
  for (const addr of m.to) if (!isValidEmail(addr)) throw new Error(`Endereço de e-mail inválido: ${addr}`);
  const lines = [
    `To: ${m.to.join(", ")}`,
    `Subject: ${encodeHeader(m.subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (m.inReplyTo) lines.push(`In-Reply-To: ${m.inReplyTo}`, `References: ${[m.references, m.inReplyTo].filter(Boolean).join(" ")}`);
  const mime = `${lines.join("\r\n")}\r\n\r\n${Buffer.from(m.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n")}`;
  return Buffer.from(mime, "utf8").toString("base64url");
}

function toSummary(m: RawMessage): EmailSummary {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m, "From"),
    subject: header(m, "Subject") || "(sem assunto)",
    date: header(m, "Date"),
    snippet: decodeEntities(m.snippet ?? ""),
    unread: m.labelIds?.includes("UNREAD") ?? false,
    important: m.labelIds?.includes("IMPORTANT") ?? false,
  };
}

export class GmailApi {
  constructor(private readonly request: GoogleFetch) {}

  async search(query: string, max = 10): Promise<EmailSummary[]> {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(max, 25)) });
    const list = (await this.request(`${BASE}/messages?${params}`)) as { messages?: { id: string }[] };
    const ids = (list.messages ?? []).map((m) => m.id);
    const meta = new URLSearchParams({ format: "metadata" });
    for (const h of ["From", "Subject", "Date"]) meta.append("metadataHeaders", h);
    const msgs = await Promise.all(ids.map((id) => this.request(`${BASE}/messages/${id}?${meta}`) as Promise<RawMessage>));
    return msgs.map(toSummary);
  }

  async read(id: string, maxChars = 6000): Promise<EmailFull> {
    const m = (await this.request(`${BASE}/messages/${encodeURIComponent(id)}?format=full`)) as RawMessage;
    const body = extractBody(m.payload);
    return {
      ...toSummary(m),
      to: header(m, "To"),
      messageId: header(m, "Message-ID") || header(m, "Message-Id") || null,
      references: header(m, "References") || null,
      body: body.length > maxChars ? `${body.slice(0, maxChars)}\n[... texto truncado ...]` : body,
    };
  }

  async countImportantUnread(): Promise<number> {
    const list = (await this.request(`${BASE}/messages?${new URLSearchParams({ q: "is:unread is:important newer_than:7d", maxResults: "50" })}`)) as {
      messages?: unknown[];
    };
    return list.messages?.length ?? 0;
  }

  async createDraft(raw: string, threadId?: string): Promise<{ id: string }> {
    return (await this.request(`${BASE}/drafts`, { method: "POST", body: JSON.stringify({ message: { raw, threadId } }) })) as { id: string };
  }

  async send(raw: string, threadId?: string): Promise<{ id: string }> {
    return (await this.request(`${BASE}/messages/send`, { method: "POST", body: JSON.stringify({ raw, threadId }) })) as { id: string };
  }
}
