import type {
  AppNotification,
  AuditEntry,
  GoogleService,
  Task,
  TaskUpdate,
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

  // ---- Fase 2 ----
  listTasks(q: TaskQuery): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: string, patch: TaskUpdate): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  listNotifications(limit: number): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<boolean>;

  /** Status da integração (sem segredos). */
  getIntegration(provider: "google"): Promise<IntegrationInfo | null>;
}

export interface TaskQuery {
  status?: "aberta" | "concluida" | "todas";
  /** Inclui tarefas com prazo até esta data (AAAA-MM-DD) ou sem prazo. */
  dueOnOrBefore?: string;
  limit?: number;
}

export interface TaskInput {
  title: string;
  notes?: string;
  space: Space;
  priority: "baixa" | "normal" | "alta";
  dueDate?: string;
  remindAt?: string;
}

export interface IntegrationInfo {
  accountEmail: string | null;
  services: GoogleService[];
  scopes: string[];
  status: "active" | "error" | "revoked";
  lastError: string | null;
  connectedAt: string;
}

export interface IntegrationSecret extends IntegrationInfo {
  encryptedRefreshToken: string;
}

export interface SummaryCandidate {
  userId: string;
  ownerName: string;
  timezone: string;
  dailySummaryEnabled: boolean;
  dailySummaryTime: string;
  meetingReminderMinutes: number;
  lastSummaryDate: string | null;
}

export interface DueReminder {
  userId: string;
  task: Task;
}

/**
 * Operações do backend SEM o token do usuário (callback OAuth, agendador).
 * Implementação Supabase usa a service_role: TODA consulta filtra por userId explicitamente.
 */
export interface SystemStore {
  upsertIntegration(input: {
    userId: string;
    provider: "google";
    accountEmail: string | null;
    scopes: string[];
    services: GoogleService[];
    encryptedRefreshToken: string;
  }): Promise<void>;
  getIntegrationSecret(userId: string, provider: "google"): Promise<IntegrationSecret | null>;
  setIntegrationStatus(userId: string, provider: "google", status: "active" | "error" | "revoked", lastError: string | null): Promise<void>;
  deleteIntegration(userId: string, provider: "google"): Promise<void>;
  listIntegratedUsers(provider: "google", service: GoogleService): Promise<string[]>;

  upsertPushToken(userId: string, token: string, deviceName?: string): Promise<void>;
  deletePushToken(token: string): Promise<void>;
  deleteUserPushToken(userId: string, token: string): Promise<boolean>;
  listPushTokens(userId: string): Promise<string[]>;

  /** Marca atomicamente e devolve lembretes vencidos (cada um só uma vez). */
  claimDueReminders(now: Date, limit: number): Promise<DueReminder[]>;
  listSummaryCandidates(): Promise<SummaryCandidate[]>;
  /** true se ESTE processo ganhou o direito de enviar o resumo do dia (evita duplicidade). */
  claimDailySummary(userId: string, localDate: string): Promise<boolean>;
  openTasksForUser(userId: string, dueOnOrBefore: string): Promise<Task[]>;

  /** Insere notificação; retorna null se a dedupe_key já existia. */
  insertNotification(input: { userId: string; kind: AppNotification["kind"]; title: string; body: string; dedupeKey: string }): Promise<string | null>;
  markNotificationDelivered(id: string): Promise<void>;
}
