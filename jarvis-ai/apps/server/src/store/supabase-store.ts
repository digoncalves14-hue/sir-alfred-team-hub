/**
 * UserStore sobre Supabase/PostgreSQL. O cliente é criado com o JWT do usuário,
 * então toda consulta passa pelas políticas de Row Level Security.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry, ChatMessage, Conversation, Memory, Profile, ToolEvent } from "@jarvis/shared";
import { AppError } from "../errors";
import { rankByQuery } from "./search";
import type { PendingActionRecord, UsageRecord, UserStore } from "./types";

type Row = Record<string, unknown>;

export function createUserClient(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new AppError("erro_banco", 502, `Falha ao acessar ${what}: ${res.error.message}`);
  return res.data;
}

const toProfile = (r: Row): Profile => ({
  ownerName: String(r.owner_name),
  assistantName: String(r.assistant_name),
  memoryEnabled: Boolean(r.memory_enabled),
  timezone: String(r.timezone),
  dailyCostLimitUsd: Number(r.daily_cost_limit_usd),
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
        .insert({ user_id: this.userId, conversation_id: input.conversationId, tool_name: input.tool, input: input.input, summary: input.summary })
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
}
