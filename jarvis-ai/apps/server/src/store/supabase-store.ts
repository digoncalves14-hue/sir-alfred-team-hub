/**
 * UserStore sobre Supabase/PostgreSQL. O cliente é criado com o JWT do usuário,
 * então toda consulta passa pelas políticas de Row Level Security.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppNotification,
  AuditEntry,
  Automation,
  ChatMessage,
  Connector,
  Conversation,
  DeviceToken,
  GoogleService,
  Memory,
  Profile,
  Report,
  Routine,
  Space,
  Task,
  TaskUpdate,
  ToolEvent,
} from "@jarvis/shared";
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
  monthlyCostLimitUsd: r.monthly_cost_limit_usd === undefined ? 20 : Number(r.monthly_cost_limit_usd),
  economyMode: Boolean(r.economy_mode),
});

export const toProfileRow = (r: Row): Profile => toProfile(r);
export const toMemoryRow = (r: Row): Memory => toMemory(r);

export const CONNECTOR_COLUMNS = "id, space, type, name, config, account_label, status, last_error, last_sync_at, created_at";
export const toConnector = (r: Row): Connector => ({
  id: String(r.id),
  space: r.space as Connector["space"],
  type: r.type as Connector["type"],
  name: String(r.name),
  config: (r.config as Record<string, unknown>) ?? {},
  accountLabel: (r.account_label as string | null) ?? null,
  status: r.status as Connector["status"],
  lastError: (r.last_error as string | null) ?? null,
  lastSyncAt: (r.last_sync_at as string | null) ?? null,
  createdAt: String(r.created_at),
});
export const REPORT_COLUMNS = "id, space, kind, title, body, created_at";
export const toReport = (r: Row): Report => ({
  id: String(r.id),
  space: (r.space as Report["space"]) ?? null,
  kind: r.kind as Report["kind"],
  title: String(r.title),
  body: String(r.body),
  createdAt: String(r.created_at),
});
export const AUTOMATION_COLUMNS = "id, kind, space, weekday, run_time, enabled, last_run_at";
export const toAutomation = (r: Row): Automation => ({
  id: String(r.id),
  kind: r.kind as Automation["kind"],
  space: (r.space as Automation["space"]) ?? null,
  weekday: r.weekday === null || r.weekday === undefined ? null : Number(r.weekday),
  runTime: String(r.run_time),
  enabled: Boolean(r.enabled),
  lastRunAt: (r.last_run_at as string | null) ?? null,
});

export const ROUTINE_COLUMNS = "id, name, trigger_phrase, instructions, weekday, run_time, schedule_enabled, enabled, last_run_at";
export const toRoutine = (r: Row): Routine => ({
  id: String(r.id),
  name: String(r.name),
  triggerPhrase: String(r.trigger_phrase),
  instructions: String(r.instructions),
  weekday: r.weekday === null || r.weekday === undefined ? null : Number(r.weekday),
  runTime: (r.run_time as string | null) ?? null,
  scheduleEnabled: Boolean(r.schedule_enabled),
  enabled: Boolean(r.enabled),
  lastRunAt: (r.last_run_at as string | null) ?? null,
});

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
    if (patch.monthlyCostLimitUsd !== undefined) row.monthly_cost_limit_usd = patch.monthlyCostLimitUsd;
    if (patch.economyMode !== undefined) row.economy_mode = patch.economyMode;
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

  // ---- Fase 4 ----
  async listConnectors(space?: Space) {
    let q = this.sb.from("jarvis_connectors").select(CONNECTOR_COLUMNS).order("created_at", { ascending: true });
    if (space) q = q.eq("space", space);
    return ((check(await q, "conectores") ?? []) as Row[]).map(toConnector);
  }
  async deleteConnector(id: string) {
    const rows = check(await this.sb.from("jarvis_connectors").delete().eq("id", id).select("id"), "conector");
    return (rows ?? []).length > 0;
  }
  async listReports(limit: number, space?: Space) {
    let q = this.sb.from("jarvis_reports").select(REPORT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
    if (space) q = q.eq("space", space);
    return ((check(await q, "relatórios") ?? []) as Row[]).map(toReport);
  }
  async getReport(id: string) {
    const r = check(await this.sb.from("jarvis_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle(), "relatório");
    return r ? toReport(r as Row) : null;
  }
  async deleteReport(id: string) {
    const rows = check(await this.sb.from("jarvis_reports").delete().eq("id", id).select("id"), "relatório");
    return (rows ?? []).length > 0;
  }
  async listAutomations() {
    const rows = check(await this.sb.from("jarvis_automations").select(AUTOMATION_COLUMNS).order("created_at", { ascending: true }), "automações");
    return ((rows ?? []) as Row[]).map(toAutomation);
  }
  async createAutomation(input: Parameters<UserStore["createAutomation"]>[0]) {
    const r = check(
      await this.sb
        .from("jarvis_automations")
        .insert({ user_id: this.userId, kind: input.kind, space: input.space, weekday: input.weekday, run_time: input.runTime, enabled: input.enabled })
        .select(AUTOMATION_COLUMNS)
        .single(),
      "automação",
    );
    return toAutomation(r as Row);
  }
  async updateAutomation(id: string, patch: Parameters<UserStore["updateAutomation"]>[1]) {
    const row: Row = {};
    if (patch.weekday !== undefined) row.weekday = patch.weekday;
    if (patch.runTime !== undefined) row.run_time = patch.runTime;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.space !== undefined) row.space = patch.space;
    const r = check(await this.sb.from("jarvis_automations").update(row).eq("id", id).select(AUTOMATION_COLUMNS).maybeSingle(), "automação");
    return r ? toAutomation(r as Row) : null;
  }
  async deleteAutomation(id: string) {
    const rows = check(await this.sb.from("jarvis_automations").delete().eq("id", id).select("id"), "automação");
    return (rows ?? []).length > 0;
  }

  // ---- Fase 5 ----
  async listRoutines() {
    const rows = check(await this.sb.from("jarvis_routines").select(ROUTINE_COLUMNS).order("created_at", { ascending: true }), "rotinas");
    return ((rows ?? []) as Row[]).map(toRoutine);
  }
  async createRoutine(input: Parameters<UserStore["createRoutine"]>[0]) {
    const r = check(
      await this.sb
        .from("jarvis_routines")
        .insert({
          user_id: this.userId,
          name: input.name,
          trigger_phrase: input.triggerPhrase,
          instructions: input.instructions,
          weekday: input.weekday,
          run_time: input.runTime,
          schedule_enabled: input.scheduleEnabled,
          enabled: input.enabled,
        })
        .select(ROUTINE_COLUMNS)
        .single(),
      "rotina",
    );
    return toRoutine(r as Row);
  }
  async updateRoutine(id: string, patch: Parameters<UserStore["updateRoutine"]>[1]) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.triggerPhrase !== undefined) row.trigger_phrase = patch.triggerPhrase;
    if (patch.instructions !== undefined) row.instructions = patch.instructions;
    if (patch.weekday !== undefined) row.weekday = patch.weekday;
    if (patch.runTime !== undefined) row.run_time = patch.runTime;
    if (patch.scheduleEnabled !== undefined) row.schedule_enabled = patch.scheduleEnabled;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    const r = check(await this.sb.from("jarvis_routines").update(row).eq("id", id).select(ROUTINE_COLUMNS).maybeSingle(), "rotina");
    return r ? toRoutine(r as Row) : null;
  }
  async deleteRoutine(id: string) {
    const rows = check(await this.sb.from("jarvis_routines").delete().eq("id", id).select("id"), "rotina");
    return (rows ?? []).length > 0;
  }

  async getConversationSummary(id: string) {
    const r = check(await this.sb.from("jarvis_conversations").select("summary, summary_upto").eq("id", id).maybeSingle(), "conversa") as Row | null;
    return { summary: (r?.summary as string | null) ?? null, upto: Number(r?.summary_upto ?? 0) };
  }
  async setConversationSummary(id: string, summary: string, upto: number) {
    check(await this.sb.from("jarvis_conversations").update({ summary, summary_upto: upto }).eq("id", id), "conversa");
  }
  async countMessages(conversationId: string) {
    const res = await this.sb.from("jarvis_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId);
    if (res.error) throw new AppError("erro_banco", 502, `Falha ao contar mensagens: ${res.error.message}`);
    return res.count ?? 0;
  }

  async setMemoryEmbedding(id: string, embedding: number[], model: string) {
    check(await this.sb.from("jarvis_memories").update({ embedding, embedding_model: model }).eq("id", id), "memória");
  }
  async listMemoryEmbeddings(model: string) {
    const rows = check(
      await this.sb.from("jarvis_memories").select("id, embedding").eq("embedding_model", model).not("embedding", "is", null).limit(2000),
      "memórias",
    ) as Row[] | null;
    return (rows ?? []).map((r) => ({ id: String(r.id), embedding: (r.embedding as number[]) ?? [] }));
  }

  async claimBudgetAlert(key: string) {
    const rows = check(
      await this.sb
        .from("jarvis_profiles")
        .update({ budget_alert_key: key })
        .eq("user_id", this.userId)
        .or(`budget_alert_key.is.null,budget_alert_key.neq.${key}`)
        .select("user_id"),
      "perfil",
    );
    return (rows ?? []).length > 0;
  }
  async usageRows(since: Date) {
    const rows = check(
      await this.sb.from("jarvis_usage").select("kind, cost_usd, created_at").gte("created_at", since.toISOString()).limit(20000),
      "consumo",
    ) as Row[] | null;
    return (rows ?? []).map((r) => ({ kind: String(r.kind), costUsd: Number(r.cost_usd), createdAt: String(r.created_at) }));
  }
}
