/**
 * Cliente tipado do backend. Toda chamada leva o access token da sessão Supabase;
 * as respostas são validadas com os mesmos esquemas usados pelo servidor.
 */
import type { z } from "zod";
import {
  ActionResolutionSchema,
  AuditEntrySchema,
  ChatResponseSchema,
  ConversationSchema,
  ChatMessageSchema,
  HealthSchema,
  MemorySchema,
  PendingActionSchema,
  ProfileSchema,
  UsageSummarySchema,
  IntegrationStatusSchema,
  NotificationSchema,
  OAuthStartResponseSchema,
  TaskSchema,
  TodaySchema,
  DeviceTokenSchema,
  DeviceTokenCreatedSchema,
  AutomationSchema,
  ConnectorMetricsSchema,
  ConnectorSchema,
  ReportSchema,
  SpaceOverviewSchema,
  RoutineSchema,
  type RoutineCreate,
  type AutomationCreate,
  type SheetConnectorCreate,
  type GoogleService,
  type TaskCreate,
  type TaskUpdate,
  type ChatRequest,
  type MemoryCreate,
  type MemoryUpdate,
  type ProfileUpdate,
  type MemoryCategory,
  type Space,
} from "@jarvis/shared";
import { z as zod } from "zod";
import { config } from "./config";
import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new ApiError(401, "nao_autenticado", "Sessão expirada. Entre novamente.");
  return t;
}

async function raw(path: string, init: RequestInit & { auth?: boolean; timeoutMs?: number } = {}): Promise<Response> {
  if (!config.apiUrl) throw new ApiError(0, "sem_servidor", "EXPO_PUBLIC_API_URL não configurado.");
  const headers: Record<string, string> = { accept: "application/json", ...(init.headers as Record<string, string>) };
  if (init.body) headers["content-type"] = "application/json";
  if (init.auth !== false) headers.authorization = `Bearer ${await token()}`;
  let res: Response;
  // AbortController + setTimeout (AbortSignal.timeout não é garantido no Hermes).
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, init.timeoutMs ?? 45_000);
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    const timeout = timedOut;
    throw new ApiError(0, timeout ? "tempo_esgotado" : "sem_conexao", timeout ? "O servidor demorou para responder." : "Não foi possível conectar ao servidor do Jarvis.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let code = "erro";
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, code, message);
  }
  return res;
}

async function json<S extends z.ZodType>(schema: S, path: string, init?: Parameters<typeof raw>[1]): Promise<z.infer<S>> {
  const res = await raw(path, init);
  return schema.parse(await res.json());
}

const body = (v: unknown) => JSON.stringify(v);

export const api = {
  health: () => json(HealthSchema, "/health", { auth: false, timeoutMs: 8000 }),
  me: () => json(zod.object({ userId: zod.string(), profile: ProfileSchema }), "/v1/me"),
  updateSettings: (patch: ProfileUpdate) => json(zod.object({ profile: ProfileSchema }), "/v1/settings", { method: "PATCH", body: body(patch) }),

  chat: (req: ChatRequest) => json(ChatResponseSchema, "/v1/chat", { method: "POST", body: body(req), timeoutMs: 90_000 }),
  conversations: () => json(zod.object({ conversations: zod.array(ConversationSchema) }), "/v1/conversations"),
  messages: (id: string) =>
    json(zod.object({ conversation: ConversationSchema, messages: zod.array(ChatMessageSchema) }), `/v1/conversations/${id}/messages`),
  deleteConversation: (id: string) => raw(`/v1/conversations/${id}`, { method: "DELETE" }).then(() => undefined),

  memories: (q: { q?: string; category?: MemoryCategory; space?: Space } = {}) => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    const qs = params.toString();
    return json(zod.object({ memories: zod.array(MemorySchema) }), `/v1/memories${qs ? `?${qs}` : ""}`);
  },
  createMemory: (m: MemoryCreate) => json(zod.object({ memory: MemorySchema }), "/v1/memories", { method: "POST", body: body(m) }),
  updateMemory: (id: string, m: MemoryUpdate) => json(zod.object({ memory: MemorySchema }), `/v1/memories/${id}`, { method: "PATCH", body: body(m) }),
  deleteMemory: (id: string) => raw(`/v1/memories/${id}`, { method: "DELETE" }).then(() => undefined),
  exportData: async () => (await raw("/v1/export", { timeoutMs: 60_000 })).text(),

  pendingActions: () => json(zod.object({ actions: zod.array(PendingActionSchema) }), "/v1/actions/pending"),
  confirmAction: (id: string) => json(ActionResolutionSchema, `/v1/actions/${id}/confirm`, { method: "POST" }),
  rejectAction: (id: string) => json(ActionResolutionSchema, `/v1/actions/${id}/reject`, { method: "POST" }),

  audit: () => json(zod.object({ entries: zod.array(AuditEntrySchema) }), "/v1/audit"),
  usage: () => json(UsageSummarySchema, "/v1/usage"),

  // ---- Fase 2 ----
  integrations: () => json(zod.object({ integrations: zod.array(IntegrationStatusSchema) }), "/v1/integrations"),
  googleStart: (services: GoogleService[]) => json(OAuthStartResponseSchema, "/v1/integrations/google/start", { method: "POST", body: body({ services }) }),
  googleComplete: (code: string, state: string) =>
    json(zod.object({ connected: zod.boolean(), accountEmail: zod.string().nullable(), services: zod.array(zod.string()) }), "/v1/integrations/google/complete", {
      method: "POST",
      body: body({ code, state }),
    }),
  googleDisconnect: () => raw("/v1/integrations/google", { method: "DELETE" }).then(() => undefined),

  today: () => json(TodaySchema, "/v1/today", { timeoutMs: 30_000 }),
  tasks: (status: "aberta" | "concluida" | "todas" = "aberta") => json(zod.object({ tasks: zod.array(TaskSchema) }), `/v1/tasks?status=${status}`),
  createTask: (t: TaskCreate) => json(zod.object({ task: TaskSchema }), "/v1/tasks", { method: "POST", body: body(t) }),
  updateTask: (id: string, patch: TaskUpdate) => json(zod.object({ task: TaskSchema }), `/v1/tasks/${id}`, { method: "PATCH", body: body(patch) }),
  deleteTask: (id: string) => raw(`/v1/tasks/${id}`, { method: "DELETE" }).then(() => undefined),

  notifications: () => json(zod.object({ notifications: zod.array(NotificationSchema) }), "/v1/notifications"),
  markNotificationRead: (id: string) => raw(`/v1/notifications/${id}/read`, { method: "POST" }).then(() => undefined),
  registerPushToken: (token: string, deviceName?: string) => raw("/v1/push-tokens", { method: "POST", body: body({ token, deviceName }) }).then(() => undefined),

  // ---- Fase 3 ----
  reportDeviceAction: (id: string, success: boolean, summary: string) =>
    json(ActionResolutionSchema, `/v1/actions/${id}/report`, { method: "POST", body: body({ success, summary: summary.slice(0, 300) }) }),
  createDeviceToken: (name: string) => json(DeviceTokenCreatedSchema, "/v1/device-tokens", { method: "POST", body: body({ name }) }),
  deviceTokens: () => json(zod.object({ tokens: zod.array(DeviceTokenSchema) }), "/v1/device-tokens"),
  revokeDeviceToken: (id: string) => raw(`/v1/device-tokens/${id}`, { method: "DELETE" }).then(() => undefined),

  // ---- Fase 4 ----
  businessOverview: (space?: Space, refresh = false) =>
    json(zod.object({ spaces: zod.array(SpaceOverviewSchema) }), `/v1/business/overview?${new URLSearchParams({ ...(space ? { space } : {}), refresh: refresh ? "1" : "0" })}`, {
      timeoutMs: 60_000,
    }),
  connectors: () =>
    json(zod.object({ connectors: zod.array(ConnectorSchema), available: zod.object({ hub: zod.boolean(), sheets: zod.boolean() }) }), "/v1/connectors"),
  createSheetConnector: (input: SheetConnectorCreate) =>
    json(zod.object({ connector: ConnectorSchema, headers: zod.array(zod.string()), rows: zod.number() }), "/v1/connectors/sheets", {
      method: "POST",
      body: body(input),
      timeoutMs: 60_000,
    }),
  hubStart: () => json(OAuthStartResponseSchema, "/v1/connectors/hub/start", { method: "POST" }),
  hubComplete: (code: string, state: string) =>
    json(zod.object({ connected: zod.boolean(), accountLabel: zod.string().nullable() }), "/v1/connectors/hub/complete", { method: "POST", body: body({ code, state }) }),
  refreshConnector: (id: string) => json(zod.object({ metrics: ConnectorMetricsSchema }), `/v1/connectors/${id}/refresh`, { method: "POST", timeoutMs: 60_000 }),
  deleteConnector: (id: string) => raw(`/v1/connectors/${id}`, { method: "DELETE" }).then(() => undefined),

  generateReport: (kind: AutomationCreate["kind"], space: Space | null) =>
    json(zod.object({ report: ReportSchema }), "/v1/reports/generate", { method: "POST", body: body({ kind, space }), timeoutMs: 90_000 }),
  reports: (space?: Space) => json(zod.object({ reports: zod.array(ReportSchema) }), `/v1/reports${space ? `?space=${space}` : ""}`),
  report: (id: string) => json(zod.object({ report: ReportSchema }), `/v1/reports/${id}`),
  deleteReport: (id: string) => raw(`/v1/reports/${id}`, { method: "DELETE" }).then(() => undefined),

  automations: () => json(zod.object({ automations: zod.array(AutomationSchema) }), "/v1/automations"),
  createAutomation: (a: AutomationCreate) => json(zod.object({ automation: AutomationSchema }), "/v1/automations", { method: "POST", body: body(a) }),
  updateAutomation: (id: string, patch: { enabled?: boolean; runTime?: string; weekday?: number | null }) =>
    json(zod.object({ automation: AutomationSchema }), `/v1/automations/${id}`, { method: "PATCH", body: body(patch) }),
  deleteAutomation: (id: string) => raw(`/v1/automations/${id}`, { method: "DELETE" }).then(() => undefined),
  runAutomation: (id: string) => json(zod.object({ report: ReportSchema }), `/v1/automations/${id}/run`, { method: "POST", timeoutMs: 90_000 }),

  // ---- Fase 5 ----
  confirmBatch: (ids: string[]) =>
    json(zod.object({ results: zod.array(zod.object({ id: zod.string(), ok: zod.boolean(), message: zod.string() })) }), "/v1/actions/confirm-batch", {
      method: "POST",
      body: body({ ids }),
      timeoutMs: 90_000,
    }),
  routines: () => json(zod.object({ routines: zod.array(RoutineSchema) }), "/v1/routines"),
  createRoutine: (r: RoutineCreate) => json(zod.object({ routine: RoutineSchema }), "/v1/routines", { method: "POST", body: body(r) }),
  updateRoutine: (id: string, patch: Partial<RoutineCreate>) => json(zod.object({ routine: RoutineSchema }), `/v1/routines/${id}`, { method: "PATCH", body: body(patch) }),
  deleteRoutine: (id: string) => raw(`/v1/routines/${id}`, { method: "DELETE" }).then(() => undefined),
  reindexMemories: () => json(zod.object({ indexed: zod.number() }), "/v1/memories/reindex", { method: "POST", timeoutMs: 120_000 }),

  /** Áudio MP3 da voz premium (ElevenLabs), quando configurada no backend. */
  tts: async (text: string): Promise<ArrayBuffer> => (await raw("/v1/tts", { method: "POST", body: body({ text }), headers: { accept: "audio/mpeg" } })).arrayBuffer(),
};
