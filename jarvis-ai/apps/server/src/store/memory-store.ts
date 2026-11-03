/**
 * Implementação em memória do UserStore — usada SOMENTE nos testes automatizados.
 * Não é usada em produção (lá o armazenamento é o Supabase/PostgreSQL).
 */
import { randomUUID } from "node:crypto";
import type { AuditEntry, ChatMessage, Conversation, Memory, Profile } from "@jarvis/shared";
import { rankByQuery } from "./search";
import type { PendingActionRecord, UsageRecord, UserStore } from "./types";

interface Db {
  profiles: Map<string, Profile>;
  conversations: (Conversation & { userId: string })[];
  messages: (ChatMessage & { userId: string; conversationId: string })[];
  memories: (Memory & { userId: string })[];
  pending: (PendingActionRecord & { userId: string })[];
  audit: (AuditEntry & { userId: string })[];
  usage: (UsageRecord & { userId: string; createdAt: Date })[];
}

export function createMemoryDb(): Db {
  return { profiles: new Map(), conversations: [], messages: [], memories: [], pending: [], audit: [], usage: [] };
}

let clock = Date.now();
/** Relógio estritamente crescente para ordenações estáveis nos testes. */
const now = () => new Date((clock = Math.max(clock + 1, Date.now()))).toISOString();

export class MemoryUserStore implements UserStore {
  constructor(
    public readonly userId: string,
    private readonly db: Db = createMemoryDb(),
  ) {}

  async getProfile(): Promise<Profile> {
    let p = this.db.profiles.get(this.userId);
    if (!p) {
      p = { ownerName: "senhor", assistantName: "Jarvis", memoryEnabled: true, timezone: "America/Sao_Paulo", dailyCostLimitUsd: 1 };
      this.db.profiles.set(this.userId, p);
    }
    return { ...p };
  }
  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const p = { ...(await this.getProfile()), ...patch };
    this.db.profiles.set(this.userId, p);
    return { ...p };
  }

  async createConversation(title: string): Promise<Conversation> {
    const c = { id: randomUUID(), title, createdAt: now(), updatedAt: now(), userId: this.userId };
    this.db.conversations.push(c);
    return strip(c);
  }
  async getConversation(id: string) {
    const c = this.db.conversations.find((x) => x.id === id && x.userId === this.userId);
    return c ? strip(c) : null;
  }
  async listConversations(limit: number) {
    return this.db.conversations
      .filter((c) => c.userId === this.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(strip);
  }
  async touchConversation(id: string) {
    const c = this.db.conversations.find((x) => x.id === id && x.userId === this.userId);
    if (c) c.updatedAt = now();
  }
  async deleteConversation(id: string) {
    const before = this.db.conversations.length;
    this.db.conversations = this.db.conversations.filter((c) => !(c.id === id && c.userId === this.userId));
    this.db.messages = this.db.messages.filter((m) => !(m.conversationId === id && m.userId === this.userId));
    return this.db.conversations.length < before;
  }

  async listMessages(conversationId: string, limit: number) {
    return this.db.messages
      .filter((m) => m.conversationId === conversationId && m.userId === this.userId)
      .slice(-limit)
      .map(({ id, role, content, toolEvents, createdAt }) => ({ id, role, content, toolEvents, createdAt }));
  }
  async addMessage(input: Parameters<UserStore["addMessage"]>[0]) {
    const m = {
      id: randomUUID(),
      role: input.role,
      content: input.content,
      toolEvents: input.toolEvents ?? [],
      createdAt: now(),
      userId: this.userId,
      conversationId: input.conversationId,
    };
    this.db.messages.push(m);
    return { id: m.id, role: m.role, content: m.content, toolEvents: m.toolEvents, createdAt: m.createdAt };
  }

  async listMemories(q: Parameters<UserStore["listMemories"]>[0]) {
    const items = this.db.memories
      .filter((m) => m.userId === this.userId)
      .filter((m) => !q.category || m.category === q.category)
      .filter((m) => !q.space || m.space === q.space)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(strip);
    return rankByQuery(items, q.query, q.limit ?? 50);
  }
  async getMemory(id: string) {
    const m = this.db.memories.find((x) => x.id === id && x.userId === this.userId);
    return m ? strip(m) : null;
  }
  async createMemory(input: Parameters<UserStore["createMemory"]>[0]) {
    const m = { id: randomUUID(), ...input, createdAt: now(), updatedAt: now(), userId: this.userId };
    this.db.memories.push(m);
    return strip(m);
  }
  async updateMemory(id: string, patch: Parameters<UserStore["updateMemory"]>[1]) {
    const m = this.db.memories.find((x) => x.id === id && x.userId === this.userId);
    if (!m) return null;
    Object.assign(m, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: now() });
    return strip(m);
  }
  async deleteMemory(id: string) {
    const before = this.db.memories.length;
    this.db.memories = this.db.memories.filter((m) => !(m.id === id && m.userId === this.userId));
    return this.db.memories.length < before;
  }

  async createPendingAction(input: Parameters<UserStore["createPendingAction"]>[0]) {
    const created = new Date();
    const rec = {
      id: randomUUID(),
      tool: input.tool,
      input: input.input,
      summary: input.summary,
      conversationId: input.conversationId,
      status: "pending" as const,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + 15 * 60_000).toISOString(),
      userId: this.userId,
    };
    this.db.pending.push(rec);
    return strip(rec);
  }
  async getPendingAction(id: string) {
    const p = this.db.pending.find((x) => x.id === id && x.userId === this.userId);
    return p ? strip(p) : null;
  }
  async resolvePendingAction(id: string, status: PendingActionRecord["status"]) {
    const p = this.db.pending.find((x) => x.id === id && x.userId === this.userId);
    if (!p) throw new Error("pending action not found");
    p.status = status;
    return strip(p);
  }
  async listPendingActions() {
    return this.db.pending.filter((p) => p.userId === this.userId && p.status === "pending").map(strip);
  }

  async logAction(entry: Parameters<UserStore["logAction"]>[0]) {
    this.db.audit.push({ id: randomUUID(), tool: entry.tool, status: entry.status, summary: entry.summary, createdAt: now(), userId: this.userId });
  }
  async listAudit(limit: number) {
    return this.db.audit.filter((a) => a.userId === this.userId).slice(-limit).reverse().map(strip);
  }

  async recordUsage(record: UsageRecord) {
    this.db.usage.push({ ...record, userId: this.userId, createdAt: new Date() });
  }
  async usageSince(since: Date) {
    const rows = this.db.usage.filter((u) => u.userId === this.userId && u.createdAt >= since);
    return {
      costUsd: rows.reduce((s, r) => s + r.costUsd, 0),
      requests: rows.length,
      inputTokens: rows.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
    };
  }
}

function strip<T extends { userId: string }>(row: T): Omit<T, "userId"> {
  const { userId: _ignored, ...rest } = row;
  return rest;
}
