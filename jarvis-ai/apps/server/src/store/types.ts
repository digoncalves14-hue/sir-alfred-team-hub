import type {
  AuditEntry,
  ChatMessage,
  Conversation,
  Memory,
  MemoryCategory,
  PendingAction,
  Profile,
  ProfileUpdate,
  Space,
  ToolEvent,
} from "@jarvis/shared";

export interface PendingActionRecord extends PendingAction {
  conversationId: string | null;
  input: unknown;
}

export interface UsageRecord {
  kind: "chat" | "tts";
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  characters?: number;
  costUsd: number;
}

export interface UsageTotals {
  costUsd: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface MemoryQuery {
  query?: string;
  category?: MemoryCategory;
  space?: Space;
  limit?: number;
}

/**
 * Acesso a dados de UM usuário. A implementação Supabase usa o JWT do usuário,
 * portanto o isolamento é garantido também pelo RLS no banco.
 */
export interface UserStore {
  readonly userId: string;

  getProfile(): Promise<Profile>;
  updateProfile(patch: ProfileUpdate): Promise<Profile>;

  createConversation(title: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(limit: number): Promise<Conversation[]>;
  touchConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<boolean>;

  /** Mensagens em ordem cronológica (as `limit` mais recentes). */
  listMessages(conversationId: string, limit: number): Promise<ChatMessage[]>;
  addMessage(input: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    inputMode?: "voice" | "text";
    toolEvents?: ToolEvent[];
  }): Promise<ChatMessage>;

  listMemories(q: MemoryQuery): Promise<Memory[]>;
  getMemory(id: string): Promise<Memory | null>;
  createMemory(input: { category: MemoryCategory; space: Space; content: string; source: "user" | "assistant" }): Promise<Memory>;
  updateMemory(id: string, patch: { category?: MemoryCategory; space?: Space; content?: string }): Promise<Memory | null>;
  deleteMemory(id: string): Promise<boolean>;

  createPendingAction(input: { conversationId: string | null; tool: string; input: unknown; summary: string }): Promise<PendingActionRecord>;
  getPendingAction(id: string): Promise<PendingActionRecord | null>;
  resolvePendingAction(id: string, status: PendingAction["status"], result?: unknown): Promise<PendingActionRecord>;
  listPendingActions(): Promise<PendingActionRecord[]>;

  logAction(entry: { tool: string; status: "executed" | "pending" | "confirmed" | "rejected" | "failed" | "blocked"; summary: string; input?: unknown }): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;

  recordUsage(record: UsageRecord): Promise<void>;
  usageSince(since: Date): Promise<UsageTotals>;
}
