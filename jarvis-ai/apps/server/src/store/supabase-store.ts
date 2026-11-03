/**
 * UserStore sobre Supabase/PostgreSQL. O cliente é criado com o JWT do usuário,
 * então toda consulta passa pelas políticas de Row Level Security.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification, AuditEntry, ChatMessage, Conversation, DeviceToken, GoogleService, Memory, Profile, Task, TaskUpdate, ToolEvent } from "@jarvis/shared";
import { AppError } from "../errors";
import { rankByQuery } from "./search";
import type { IntegrationInfo, PendingActionRecord, TaskInput, TaskQuery, UsageRecord, UserStore } from "./types";

type Row = Record<string, unknown>;

export function createUserClient(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new AppError("erro_banco", 502, `Falha ao acessar ${what}: ${res.error.message}`);
  return res.data;
}

const toProfile = (r: Row): Profile => ({
  ownerName: String(r.owner_name),
  assistantName: String(r.assistant_name),
  memoryEnabled: Boolean(r.memory_enabled),
  timezone: String(r.timezone),
  dailyCostLimitUsd: Number(r.daily_cost_limit_usd),
  dailySummaryEnabled: r.daily_summary_enabled === undefined ? true : Boolean(r.daily_summary_enabled),
  dailySummaryTime: r.daily_summary_time ? String(r.daily_summary_time) : "08:00",
  meetingReminderMinutes: r.meeting_reminder_minutes === undefined ? 10 : Number(r.meeting_reminder_minutes),
});

export const toProfileRow = (r: Row): Profile => toProfile(r);
export const toMemoryRow = (r: Row): Memory => toMemory(r);

export const TASK_COLUMNS = "id, title, notes, space, priority, due_date, remind_at, status, completed_at, created_at";
export const toTask = (r: Row): Task => ({
  id: String(r.id),
  title: String(r.title),
  notes: (r.notes as string | null) ?? null,
  space: r.space as Task["space"],
  priority: r.priority as Task["priority"],
  dueDate: (r.due_date as string | null) ?? null,
  remindAt: r.remind_at ? new Date(String(r.remind_at)).toISOString() : null,
  status: r.status as Task["status"],
  completedAt: (r.completed_at as string | null) ?? null,
  createdAt: String(r.created_at),
});
const toConversation = (r: Row): Conversation => ({
  id: String(r.id),
  title: String(r.title),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toMessage = (r: Row): ChatMessage => ({
  id: String(r.id),
  role: r.role as ChatMessage["role"],
  content: String(r.content),
  toolEvents: (r.tool_events as ToolEvent[] | null) ?? [],
  createdAt: String(r.created_at),
});
const toMemory = (r: Row): Memory => ({
  id: String(r.id),
  category: r.category as Memory["category"],
  space: r.space as Memory["space"],
  content: String(r.content),
  source: r.source as Memory["source"],
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toPending = (r: Row): PendingActionRecord => ({
  id: String(r.id),
  tool: String(r.tool_name),
  summary: String(r.summary),
  status: r.status as PendingActionRecord["status"],
  createdAt: String(r.created_at),
  expiresAt: String(r.expires_at),
  conversationId: (r.conversation_id as string | null) ?? null,
  input: r.input,
  executor: r.executor === "device" ? "device" : "server",
});

const MEMORY_COLUMNS = "id, category, space, content, source, created_at, updated_at";

export class SupabaseUserStore implements UserStore {
  constructor(
    public readonly userId: string,
    private readonly sb: SupabaseClient,
  ) {}

  async getProfile(): Promise<Profile> {
    const found = check(await this.sb.from("jarvis_profiles").select("*").eq("user_id", this.userId).maybeSingle(), "perfil");
    if (found) return toProfile(found);
    const created = check(
      await this.sb.from("jarvis_profiles").upsert({ user_id: this.userId }, { onConflict: "user_id" }).select("*").single(),
      "perfil",
    );
    return toProfile(created);
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    await this.getProfile();
    const row: Row = {};
    if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
    if (patch.assistantName !== undefined) row.assistant_name = patch.assistantName;
    if (patch.memoryEnabled !== undefined) row.memory_enabled = patch.memoryEnabled;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.dailyCostLimitUsd !== undefined) row.daily_cost_limit_usd = patch.dailyCostLimitUsd;
    if (patch.dailySummaryEnabled !== undefined) row.daily_summary_enabled = patch.dailySummaryEnabled;
    if (patch.dailySummaryTime !== undefined) row.daily_summary_time = patch.dailySummaryTime;
    if (patch.meetingReminderMinutes !== undefined) row.meeting_reminder_minutes = patch.meetingReminderMinutes;
    const updated = check(await this.sb.from("jarvis_profiles").update(row).eq("user_id", this.userId).select("*").single(), "perfil");
    return toProfile(updated);
  }

  async createConversation(title: string) {
    const r = check(await this.sb.from("jarvis_conversations").insert({ user_id: this.userId, title }).select("*").single(), "conversa");
    return toConversation(r);
  }
  async getConversation(id: string) {
    const r = check(await this.sb.from("jarvis_conversations").select("*").eq("id", id).maybeSingle(), "conversa");
    return r ? toConversation(r) : null;
  }
  async listConversations(limit: number) {
    const rows = check(
      await this.sb.from("jarvis_conversations").select("*").order("updated_at", { ascending: false }).limit(limit),
      "conversas",
    );
    return (rows ?? []).map(toConversation);
  }
  async touchConversation(id: string) {
    check(await this.sb.from("jarvis_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id), "conversa");
  }
  async deleteConversation(id: string) {
    const rows = check(await this.sb.from("jarvis_conversations").delete().eq("id", id).select("id"), "conversa");
    return (rows ?? []).length > 0;
  }

  async listMessages(conversationId: string, limit: number) {
    const rows = check(
      await this.sb
        .from("jarvis_messages")
        .select("id, role, content, tool_events, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit),
      "mensagens",
    );
    return (rows ?? []).map(toMessage).reverse();
  }
  async addMessage(input: Parameters<UserStore["addMessage"]>[0]) {
    const r = check(
      await this.sb
        .from("jarvis_messages")
        .insert({
          user_id: this.userId,
          conversation_id: input.conversationId,
          role: input.role,
          content: input.content,
          input_mode: input.inputMode ?? null,
          tool_events: input.toolEvents ?? [],
        })
        .select("id, role, content, tool_events, created_at")
        .single(),
      "mensagem",
    );
    return toMessage(r as Row);
  }

  async listMemories(q: Parameters<UserStore["listMemories"]>[0]) {
    let query = this.sb.from("jarvis_memories").select(MEMORY_COLUMNS).order("updated_at", { ascending: false });
    if (q.category) query = query.eq("category", q.category);
    if (q.space) query = query.eq("space", q.space);
    // Cada usuário tem poucas centenas de memórias: buscamos as recentes e
    // ordenamos por relevância no servidor, sem diferenciar acentos.
    const rows = check(await query.limit(q.query ? 500 : (q.limit ?? 50)), "memórias");
    return rankByQuery((rows ?? []).map(toMemory), q.query, q.limit ?? 50);
  }
  async getMemory(id: string) {
    const r = check(await this.sb.from("jarvis_memories").select(MEMORY_COLUMNS).eq("id", id).maybeSingle(), "memória");
    return r ? toMemory(r) : null;
  }
  async createMemory(input: Parameters<UserStore["createMemory"]>[0]) {
    const r = check(
      await this.sb.from("jarvis_memories").insert({ user_id: this.userId, ...input }).select(MEMORY_COLUMNS).single(),
      "memória",
    );
    return toMemory(r as Row);
  }
  async updateMemory(id: string, patch: Parameters<UserStore["updateMemory"]>[1]) {
    const row = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const r = check(await this.sb.from("jarvis_memories").update(row).eq("id", id).select(MEMORY_COLUMNS).maybeSingle(), "memória");
    return r ? toMemory(r) : null;
  }
  async deleteMemory(id: string) {
    const rows = check(await this.sb.from("jarvis_memories").delete().eq("id", id).select("id"), "memória");
    return (rows ?? []).length > 0;
  }

  async createPendingAction(input: Parameters<UserStore["createPendingAction"]>[0]) {
    const r = check(
      await this.sb
        .from("jarvis_pending_actions")
        .insert({
          user_id: this.userId,
          conversation_id: input.conversationId,
          tool_name: input.tool,
          input: input.input,
          summary: input.summary,
          executor: input.executor ?? "server",
        })
        .select("*")
        .single(),
      "ação pendente",
    );
    return toPending(r);
  }
  async getPendingAction(id: string) {
    const r = check(await this.sb.from("jarvis_pending_actions").select("*").eq("id", id).maybeSingle(), "ação pendente");
    return r ? toPending(r) : null;
  }
  async resolvePendingAction(id: string, status: PendingActionRecord["status"], result?: unknown) {
    const r = check(
      await this.sb
        .from("jarvis_pending_actions")
        .update({ status, result: result ?? null, resolved_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single(),
      "ação pendente",
    );
    return toPending(r);
  }
  async listPendingActions() {
    const rows = check(
      await this.sb
        .from("jarvis_pending_actions")
        .select("*")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(20),
      "ações pendentes",
    );
    return (rows ?? []).map(toPending);
  }

  async logAction(entry: Parameters<UserStore["logAction"]>[0]) {
    check(
      await this.sb.from("jarvis_action_log").insert({
        user_id: this.userId,
        tool_name: entry.tool,
        status: entry.status,
        summary: entry.summary.slice(0, 500),
        input: entry.input ?? null,
      }),
      "registro de ações",
    );
  }
  async listAudit(limit: number): Promise<AuditEntry[]> {
    const rows = check(
      await this.sb.from("jarvis_action_log").select("id, tool_name, status, summary, created_at").order("created_at", { ascending: false }).limit(limit),
      "registro de ações",
    );
    return (rows ?? []).map((r: Row) => ({
      id: String(r.id),
      tool: String(r.tool_name),
      status: String(r.status),
      summary: String(r.summary),
      createdAt: String(r.created_at),
    }));
  }

  async recordUsage(u: UsageRecord) {
    check(
      await this.sb.from("jarvis_usage").insert({
        user_id: this.userId,
        kind: u.kind,
        provider: u.provider,
        model: u.model,
        input_tokens: u.inputTokens ?? 0,
        output_tokens: u.outputTokens ?? 0,
        cache_read_tokens: u.cacheReadTokens ?? 0,
        characters: u.characters ?? 0,
        cost_usd: u.costUsd,
      }),
      "consumo",
    );
  }
  async usageSince(since: Date) {
    const rows = check(
      await this.sb.from("jarvis_usage").select("cost_usd, input_tokens, output_tokens").gte("created_at", since.toISOString()).limit(10000),
      "consumo",
    );
    const list = (rows ?? []) as Row[];
    return {
      costUsd: list.reduce((s, r) => s + Number(r.cost_usd), 0),
      requests: list.length,
      inputTokens: list.reduce((s, r) => s + Number(r.input_tokens), 0),
      outputTokens: list.reduce((s, r) => s + Number(r.output_tokens), 0),
    };
  }

  // ---- Fase 2 ----
  async listTasks(q: TaskQuery) {
    let query = this.sb.from("jarvis_tasks").select(TASK_COLUMNS);
    const status = q.status ?? "aberta";
    if (status !== "todas") query = query.eq("status", status);
    if (q.dueOnOrBefore) query = query.or(`due_date.is.null,due_date.lte.${q.dueOnOrBefore}`);
    const rows = check(
      await query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(q.limit ?? 100),
      "tarefas",
    );
    return (rows ?? []).map(toTask);
  }
  async getTask(id: string) {
    const r = check(await this.sb.from("jarvis_tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle(), "tarefa");
    return r ? toTask(r as Row) : null;
  }
  async createTask(input: TaskInput) {
    const r = check(
      await this.sb
        .from("jarvis_tasks")
        .insert({
          user_id: this.userId,
          title: input.title,
          notes: input.notes ?? null,
          space: input.space,
          priority: input.priority,
          due_date: input.dueDate ?? null,
          remind_at: input.remindAt ?? null,
        })
        .select(TASK_COLUMNS)
        .single(),
      "tarefa",
    );
    return toTask(r as Row);
  }
  async updateTask(id: string, patch: TaskUpdate) {
    const row: Row = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.space !== undefined) row.space = patch.space;
    if (patch.priority !== undefined) row.priority = patch.priority;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
    if (patch.remindAt !== undefined) {
      row.remind_at = patch.remindAt;
      row.reminded_at = null;
    }
    if (patch.status !== undefined) {
      row.status = patch.status;
      row.completed_at = patch.status === "concluida" ? new Date().toISOString() : null;
    }
    const r = check(await this.sb.from("jarvis_tasks").update(row).eq("id", id).select(TASK_COLUMNS).maybeSingle(), "tarefa");
    return r ? toTask(r as Row) : null;
  }
  async deleteTask(id: string) {
    const rows = check(await this.sb.from("jarvis_tasks").delete().eq("id", id).select("id"), "tarefa");
    return (rows ?? []).length > 0;
  }

  async listNotifications(limit: number): Promise<AppNotification[]> {
    const rows = check(
      await this.sb.from("jarvis_notifications").select("id, kind, title, body, read_at, created_at").order("created_at", { ascending: false }).limit(limit),
      "notificações",
    );
    return (rows ?? []).map((r: Row) => ({
      id: String(r.id),
      kind: r.kind as AppNotification["kind"],
      title: String(r.title),
      body: String(r.body),
      readAt: (r.read_at as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  }
  async markNotificationRead(id: string) {
    const rows = check(await this.sb.from("jarvis_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("id"), "notificação");
    return (rows ?? []).length > 0;
  }

  async getIntegration(provider: "google"): Promise<IntegrationInfo | null> {
    const r = check(
      await this.sb
        .from("jarvis_integrations")
        .select("account_email, scopes, services, status, last_error, connected_at")
        .eq("provider", provider)
        .maybeSingle(),
      "integração",
    );
    if (!r) return null;
    const row = r as Row;
    return {
      accountEmail: (row.account_email as string | null) ?? null,
      scopes: (row.scopes as string[]) ?? [],
      services: (row.services as GoogleService[]) ?? [],
      status: row.status as IntegrationInfo["status"],
      lastError: (row.last_error as string | null) ?? null,
      connectedAt: String(row.connected_at),
    };
  }

  // ---- Fase 3 ----
  async listDeviceTokens(): Promise<DeviceToken[]> {
    const rows = check(
      await this.sb.from("jarvis_device_tokens").select("id, name, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }).limit(50),
      "aparelhos",
    );
    return ((rows ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      createdAt: String(r.created_at),
      lastUsedAt: (r.last_used_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
    }));
  }
  async revokeDeviceToken(id: string) {
    const rows = check(
      await this.sb.from("jarvis_device_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id"),
      "aparelho",
    );
    return (rows ?? []).length > 0;
  }
}
