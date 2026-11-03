/**
 * Implementação em memória do UserStore — usada SOMENTE nos testes automatizados.
 * Não é usada em produção (lá o armazenamento é o Supabase/PostgreSQL).
 */
import { randomUUID } from "node:crypto";
import type { AppNotification, AuditEntry, ChatMessage, Conversation, DeviceToken, Memory, MemoryCategory, Profile, Space, Task, TaskUpdate } from "@jarvis/shared";
import { rankByQuery } from "./search";
import type {
  IntegrationSecret,
  PendingActionRecord,
  SystemStore,
  TaskInput,
  TaskQuery,
  UsageRecord,
  UserStore,
} from "./types";

interface Db {
  profiles: Map<string, Profile>;
  conversations: (Conversation & { userId: string })[];
  messages: (ChatMessage & { userId: string; conversationId: string })[];
  memories: (Memory & { userId: string })[];
  pending: (PendingActionRecord & { userId: string })[];
  audit: (AuditEntry & { userId: string })[];
  usage: (UsageRecord & { userId: string; createdAt: Date })[];
  tasks: (Task & { userId: string; remindedAt: string | null })[];
  notifications: (AppNotification & { userId: string; dedupeKey: string; delivered: boolean })[];
  integrations: (IntegrationSecret & { userId: string; provider: "google" })[];
  pushTokens: { token: string; userId: string; deviceName?: string }[];
  lastSummary: Map<string, string>;
  deviceTokens: (DeviceToken & { userId: string; tokenHash: string })[];
}

export function createMemoryDb(): Db {
  return {
    profiles: new Map(),
    conversations: [],
    messages: [],
    memories: [],
    pending: [],
    audit: [],
    usage: [],
    tasks: [],
    notifications: [],
    integrations: [],
    pushTokens: [],
    lastSummary: new Map(),
    deviceTokens: [],
  };
}

export const DEFAULT_PROFILE: Profile = {
  ownerName: "senhor",
  assistantName: "Jarvis",
  memoryEnabled: true,
  timezone: "America/Sao_Paulo",
  dailyCostLimitUsd: 1,
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  meetingReminderMinutes: 10,
};

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
      p = { ...DEFAULT_PROFILE };
      this.db.profiles.set(this.userId, p);
    }
    return { ...p };
  }
  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const p = { ...(await this.getProfile()), ...stripUndefined(patch) };
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
      executor: input.executor ?? ("server" as const),
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

  // ---- Fase 2 ----
  async listTasks(q: TaskQuery) {
    return this.db.tasks
      .filter((t) => t.userId === this.userId)
      .filter((t) => (q.status ?? "aberta") === "todas" || t.status === (q.status ?? "aberta"))
      .filter((t) => !q.dueOnOrBefore || !t.dueDate || t.dueDate <= q.dueOnOrBefore)
      .sort(compareTasks)
      .slice(0, q.limit ?? 100)
      .map(publicTask);
  }
  async getTask(id: string) {
    const t = this.db.tasks.find((x) => x.id === id && x.userId === this.userId);
    return t ? publicTask(t) : null;
  }
  async createTask(input: TaskInput) {
    const t = {
      id: randomUUID(),
      title: input.title,
      notes: input.notes ?? null,
      space: input.space,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      remindAt: input.remindAt ? new Date(input.remindAt).toISOString() : null,
      status: "aberta" as const,
      completedAt: null,
      createdAt: now(),
      userId: this.userId,
      remindedAt: null,
    };
    this.db.tasks.push(t);
    return publicTask(t);
  }
  async updateTask(id: string, patch: TaskUpdate) {
    const t = this.db.tasks.find((x) => x.id === id && x.userId === this.userId);
    if (!t) return null;
    const clean = stripUndefined(patch);
    if (clean.remindAt !== undefined) {
      clean.remindAt = clean.remindAt ? new Date(clean.remindAt).toISOString() : null;
      t.remindedAt = null;
    }
    Object.assign(t, clean);
    if (patch.status === "concluida") t.completedAt = now();
    if (patch.status === "aberta") t.completedAt = null;
    return publicTask(t);
  }
  async deleteTask(id: string) {
    const before = this.db.tasks.length;
    this.db.tasks = this.db.tasks.filter((t) => !(t.id === id && t.userId === this.userId));
    return this.db.tasks.length < before;
  }

  async listNotifications(limit: number) {
    return this.db.notifications
      .filter((n) => n.userId === this.userId)
      .slice(-limit)
      .reverse()
      .map(({ id, kind, title, body, readAt, createdAt }) => ({ id, kind, title, body, readAt, createdAt }));
  }
  async markNotificationRead(id: string) {
    const n = this.db.notifications.find((x) => x.id === id && x.userId === this.userId);
    if (!n) return false;
    n.readAt = now();
    return true;
  }

  async listDeviceTokens() {
    return this.db.deviceTokens.filter((t) => t.userId === this.userId).map(({ userId: _u, tokenHash: _h, ...t }) => t);
  }
  async revokeDeviceToken(id: string) {
    const t = this.db.deviceTokens.find((x) => x.id === id && x.userId === this.userId && !x.revokedAt);
    if (!t) return false;
    t.revokedAt = now();
    return true;
  }

  async getIntegration(provider: "google") {
    const i = this.db.integrations.find((x) => x.userId === this.userId && x.provider === provider);
    if (!i) return null;
    const { encryptedRefreshToken: _secret, userId: _u, provider: _p, ...info } = i;
    return info;
  }
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const PRIORITY_ORDER = { alta: 0, normal: 1, baixa: 2 } as const;
export function compareTasks(a: Task, b: Task): number {
  const da = a.dueDate ?? "9999-12-31";
  const db = b.dueDate ?? "9999-12-31";
  return da.localeCompare(db) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt.localeCompare(b.createdAt);
}

function publicTask(t: Task & { userId: string; remindedAt: string | null }): Task {
  const { userId: _u, remindedAt: _r, ...rest } = t;
  return { ...rest };
}

/** SystemStore em memória (somente testes). */
export class MemorySystemStore implements SystemStore {
  constructor(private readonly db: Db) {}

  async upsertIntegration(input: Parameters<SystemStore["upsertIntegration"]>[0]) {
    this.db.integrations = this.db.integrations.filter((i) => !(i.userId === input.userId && i.provider === input.provider));
    this.db.integrations.push({
      userId: input.userId,
      provider: input.provider,
      accountEmail: input.accountEmail,
      scopes: input.scopes,
      services: input.services,
      encryptedRefreshToken: input.encryptedRefreshToken,
      status: "active",
      lastError: null,
      connectedAt: now(),
    });
  }
  async getIntegrationSecret(userId: string, provider: "google") {
    const i = this.db.integrations.find((x) => x.userId === userId && x.provider === provider);
    if (!i) return null;
    const { userId: _u, provider: _p, ...rest } = i;
    return { ...rest };
  }
  async setIntegrationStatus(userId: string, provider: "google", status: "active" | "error" | "revoked", lastError: string | null) {
    const i = this.db.integrations.find((x) => x.userId === userId && x.provider === provider);
    if (i) Object.assign(i, { status, lastError });
  }
  async deleteIntegration(userId: string, provider: "google") {
    this.db.integrations = this.db.integrations.filter((i) => !(i.userId === userId && i.provider === provider));
  }
  async listIntegratedUsers(provider: "google", service: "calendar" | "gmail") {
    return this.db.integrations.filter((i) => i.provider === provider && i.status === "active" && i.services.includes(service)).map((i) => i.userId);
  }

  async upsertPushToken(userId: string, token: string, deviceName?: string) {
    this.db.pushTokens = this.db.pushTokens.filter((t) => t.token !== token);
    this.db.pushTokens.push({ token, userId, deviceName });
  }
  async deletePushToken(token: string) {
    this.db.pushTokens = this.db.pushTokens.filter((t) => t.token !== token);
  }
  async deleteUserPushToken(userId: string, token: string) {
    const before = this.db.pushTokens.length;
    this.db.pushTokens = this.db.pushTokens.filter((t) => !(t.token === token && t.userId === userId));
    return this.db.pushTokens.length < before;
  }
  async listPushTokens(userId: string) {
    return this.db.pushTokens.filter((t) => t.userId === userId).map((t) => t.token);
  }

  async claimDueReminders(at: Date, limit: number) {
    const due = this.db.tasks
      .filter((t) => t.status === "aberta" && t.remindAt && !t.remindedAt && new Date(t.remindAt) <= at)
      .slice(0, limit);
    for (const t of due) t.remindedAt = at.toISOString();
    return due.map((t) => ({ userId: t.userId, task: publicTask(t) }));
  }
  async listSummaryCandidates() {
    return [...this.db.profiles.entries()].map(([userId, p]) => ({
      userId,
      ownerName: p.ownerName,
      timezone: p.timezone,
      dailySummaryEnabled: p.dailySummaryEnabled,
      dailySummaryTime: p.dailySummaryTime,
      meetingReminderMinutes: p.meetingReminderMinutes,
      lastSummaryDate: this.db.lastSummary.get(userId) ?? null,
    }));
  }
  async claimDailySummary(userId: string, localDate: string) {
    const last = this.db.lastSummary.get(userId);
    if (last && last >= localDate) return false;
    this.db.lastSummary.set(userId, localDate);
    return true;
  }
  async openTasksForUser(userId: string, dueOnOrBefore: string) {
    return this.db.tasks
      .filter((t) => t.userId === userId && t.status === "aberta" && (!t.dueDate || t.dueDate <= dueOnOrBefore))
      .sort(compareTasks)
      .map(publicTask);
  }
  async insertNotification(input: Parameters<SystemStore["insertNotification"]>[0]) {
    if (this.db.notifications.some((n) => n.userId === input.userId && n.dedupeKey === input.dedupeKey)) return null;
    const id = randomUUID();
    this.db.notifications.push({ id, ...input, readAt: null, createdAt: now(), delivered: false });
    return id;
  }
  async markNotificationDelivered(id: string) {
    const n = this.db.notifications.find((x) => x.id === id);
    if (n) n.delivered = true;
  }

  // ---- Fase 3 ----
  async createDeviceToken(userId: string, tokenHash: string, name: string) {
    const id = randomUUID();
    this.db.deviceTokens.push({ id, userId, tokenHash, name, createdAt: now(), lastUsedAt: null, revokedAt: null });
    return id;
  }
  async resolveDeviceToken(tokenHash: string) {
    const t = this.db.deviceTokens.find((x) => x.tokenHash === tokenHash && !x.revokedAt);
    if (!t) return null;
    t.lastUsedAt = now();
    return t.userId;
  }
  async getProfileFor(userId: string) {
    return new MemoryUserStore(userId, this.db).getProfile();
  }
  async createTaskFor(userId: string, input: TaskInput) {
    return new MemoryUserStore(userId, this.db).createTask(input);
  }
  async createMemoryFor(userId: string, input: { category: MemoryCategory; space: Space; content: string }) {
    return new MemoryUserStore(userId, this.db).createMemory({ ...input, source: "user" });
  }
  async logActionFor(userId: string, entry: { tool: string; status: "executed" | "failed" | "blocked"; summary: string }) {
    return new MemoryUserStore(userId, this.db).logAction(entry);
  }
}

function strip<T extends { userId: string }>(row: T): Omit<T, "userId"> {
  const { userId: _ignored, ...rest } = row;
  return rest;
}
