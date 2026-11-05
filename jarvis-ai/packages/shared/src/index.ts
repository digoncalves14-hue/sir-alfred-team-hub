/**
 * Contratos compartilhados entre o app (Expo) e o backend (Node).
 * Toda entrada e saída da API é validada com estes esquemas.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Espaços (separação de dados pessoais x empresariais)
// ---------------------------------------------------------------------------
export const SPACES = [
  "pessoal",
  "sir_alfred",
  "black_bear",
  "barton",
  "alfie_fred",
  "educacao",
] as const;
export const SpaceSchema = z.enum(SPACES);
export type Space = z.infer<typeof SpaceSchema>;

export const SPACE_LABELS: Record<Space, string> = {
  pessoal: "Pessoal",
  sir_alfred: "Sir Alfred",
  black_bear: "Black Bear",
  barton: "Barton",
  alfie_fred: "Alfie & Fred",
  educacao: "Educação",
};

// ---------------------------------------------------------------------------
// Memória
// ---------------------------------------------------------------------------
export const MEMORY_CATEGORIES = [
  "preferencia",
  "profissional",
  "projeto",
  "decisao",
  "compromisso",
  "outro",
] as const;
export const MemoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preferencia: "Preferências",
  profissional: "Profissional",
  projeto: "Projetos",
  decisao: "Decisões",
  compromisso: "Compromissos e tarefas",
  outro: "Outros",
};

export const MemorySchema = z.object({
  id: z.string().uuid(),
  category: MemoryCategorySchema,
  space: SpaceSchema,
  content: z.string(),
  source: z.enum(["user", "assistant"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const MemoryCreateSchema = z.object({
  category: MemoryCategorySchema,
  space: SpaceSchema.default("pessoal"),
  content: z.string().trim().min(2).max(2000),
});
export type MemoryCreate = z.infer<typeof MemoryCreateSchema>;

// Sem valores padrão: uma correção parcial não pode alterar campos omitidos.
export const MemoryUpdateSchema = z
  .object({
    category: MemoryCategorySchema,
    space: SpaceSchema,
    content: z.string().trim().min(2).max(2000),
  })
  .partial();
export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>;

// ---------------------------------------------------------------------------
// Perfil / configurações
// ---------------------------------------------------------------------------
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

export const ProfileSchema = z.object({
  ownerName: z.string(),
  assistantName: z.string(),
  memoryEnabled: z.boolean(),
  timezone: z.string(),
  dailyCostLimitUsd: z.number(),
  dailySummaryEnabled: z.boolean(),
  dailySummaryTime: z.string(),
  /** 0 = desativado. */
  meetingReminderMinutes: z.number().int(),
  monthlyCostLimitUsd: z.number(),
  /** Modo econômico: usa o modelo mais barato configurado no servidor. */
  economyMode: z.boolean(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(1).max(60),
    assistantName: z.string().trim().min(1).max(30),
    memoryEnabled: z.boolean(),
    timezone: z.string().trim().min(3).max(64),
    dailyCostLimitUsd: z.number().min(0).max(100),
    dailySummaryEnabled: z.boolean(),
    dailySummaryTime: HHMM,
    meetingReminderMinutes: z.number().int().min(0).max(120),
    monthlyCostLimitUsd: z.number().min(0).max(1000),
    economyMode: z.boolean(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Fase 3 — ações executadas no próprio iPhone (após confirmação)
// ---------------------------------------------------------------------------
const LOCAL_DT = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const COMMUNICATION_CHANNELS = ["ligacao", "sms", "whatsapp", "email", "mapa", "link"] as const;

export const DeviceActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lembrete_iphone"),
    input: z.object({ titulo: z.string().min(1).max(300), dataHora: LOCAL_DT.optional(), notas: z.string().max(2000).optional() }),
  }),
  z.object({
    kind: z.literal("evento_iphone"),
    input: z.object({ titulo: z.string().min(1).max(200), inicio: LOCAL_DT, duracaoMin: z.number().int().min(5).max(1440), local: z.string().max(200).optional() }),
  }),
  z.object({
    kind: z.literal("comunicacao"),
    input: z.object({
      canal: z.enum(COMMUNICATION_CHANNELS),
      /** Nome a procurar nos contatos do iPhone (a busca acontece no aparelho). */
      contato: z.string().max(100).optional(),
      /** Número, e-mail, endereço ou URL explícitos. */
      destino: z.string().max(500).optional(),
      mensagem: z.string().max(2000).optional(),
      assunto: z.string().max(200).optional(),
    }),
  }),
]);
export type DeviceAction = z.infer<typeof DeviceActionSchema>;

/** Resultado de uma ferramenta, exibido como feedback visual no app. */
export const ToolEventSchema = z.object({
  tool: z.string(),
  label: z.string(),
  /** executed = executada de verdade; pending = aguardando autorização; failed = erro; rejected = negada pelo usuário */
  status: z.enum(["executed", "pending", "failed", "rejected"]),
  summary: z.string(),
  pendingActionId: z.string().uuid().optional(),
  /** Presente quando a ação é executada no iPhone após a confirmação. */
  device: DeviceActionSchema.optional(),
});
export type ToolEvent = z.infer<typeof ToolEventSchema>;

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  /** Origem do texto: voz (transcrição) ou digitação. */
  inputMode: z.enum(["voice", "text"]).default("text"),
  /** Fuso do aparelho (IANA), usado para interpretar datas relativas. */
  timezone: z.string().max(64).optional(),
  /** Dados lidos no iPhone com permissão do usuário (somente leitura). */
  deviceContext: z.lazy(() => DeviceContextSchema).optional(),
  /** Executa uma rotina específica (ex.: aberta por notificação agendada). */
  routineId: z.string().uuid().optional(),
  /** Versão do app: iPhone (nativo) ou web (navegador). */
  client: z.enum(["ios", "web"]).optional(),
});
export type ChatRequest = z.input<typeof ChatRequestSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  toolEvents: z.array(ToolEventSchema).default([]),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatResponseSchema = z.object({
  conversationId: z.string().uuid(),
  reply: ChatMessageSchema,
  /** Texto adequado para ser falado (sem markdown). */
  speech: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  }),
  /** Aviso ao usuário (ex.: 80% do limite mensal). */
  notice: z.string().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

// ---------------------------------------------------------------------------
// Ações pendentes (confirmação explícita)
// ---------------------------------------------------------------------------
export const PendingActionSchema = z.object({
  id: z.string().uuid(),
  tool: z.string(),
  summary: z.string(),
  status: z.enum(["pending", "confirmed", "rejected", "expired", "failed"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  executor: z.enum(["server", "device"]).default("server"),
  device: DeviceActionSchema.optional(),
});
export type PendingAction = z.infer<typeof PendingActionSchema>;

export const ActionResolutionSchema = z.object({
  action: PendingActionSchema,
  /** Mensagem honesta sobre o resultado (executado de fato ou não). */
  message: z.string(),
});
export type ActionResolution = z.infer<typeof ActionResolutionSchema>;

// ---------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------
export const UsageSummarySchema = z.object({
  today: z.object({ costUsd: z.number(), requests: z.number(), inputTokens: z.number(), outputTokens: z.number() }),
  last30Days: z.object({ costUsd: z.number(), requests: z.number() }),
  dailyLimitUsd: z.number(),
  model: z.string(),
  /** Fase 5 — mês corrente, por recurso e por dia. */
  month: z.object({ costUsd: z.number(), requests: z.number(), limitUsd: z.number() }).default({ costUsd: 0, requests: 0, limitUsd: 0 }),
  byKind: z.array(z.object({ kind: z.string(), costUsd: z.number(), requests: z.number() })).default([]),
  byDay: z.array(z.object({ date: z.string(), costUsd: z.number() })).default([]),
  economyMode: z.boolean().default(false),
  economyModel: z.string().nullable().default(null),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const HealthSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  ai: z.object({ provider: z.string(), model: z.string(), configured: z.boolean() }),
  tts: z.object({ provider: z.string(), configured: z.boolean() }),
  google: z.object({ configured: z.boolean() }).default({ configured: false }),
  push: z.object({ configured: z.boolean() }).default({ configured: false }),
  /** running: laço interno ativo; cron: disponível via POST /internal/cron/tick. */
  scheduler: z.object({ running: z.boolean(), cron: z.boolean().default(false) }).default({ running: false, cron: false }),
  business: z
    .object({ connectors: z.boolean(), hub: z.boolean(), sheets: z.boolean() })
    .default({ connectors: false, hub: false, sheets: false }),
  memory: z.object({ semantic: z.boolean() }).default({ semantic: false }),
  streaming: z.boolean().default(false),
});
export type Health = z.infer<typeof HealthSchema>;

export const TtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(1500),
  /** Voz escolhida pelo usuário (ID da ElevenLabs). Sem ela, usa a voz padrão do servidor. */
  voiceId: z.string().regex(/^[A-Za-z0-9]{10,40}$/).optional(),
  /** Velocidade da fala (0,7 = mais lenta, 1,2 = mais rápida). */
  speed: z.number().min(0.7).max(1.2).optional(),
});

/** Erro padronizado da API. */
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------------------------------------------------------------------------
// Fase 2 — Integrações, tarefas, notificações
// ---------------------------------------------------------------------------
export const GOOGLE_SERVICES = ["calendar", "gmail", "sheets"] as const;
export const GoogleServiceSchema = z.enum(GOOGLE_SERVICES);
export type GoogleService = z.infer<typeof GoogleServiceSchema>;

export const IntegrationStatusSchema = z.object({
  provider: z.literal("google"),
  /** O backend tem as credenciais OAuth configuradas? */
  available: z.boolean(),
  connected: z.boolean(),
  accountEmail: z.string().nullable(),
  services: z.array(GoogleServiceSchema),
  status: z.enum(["active", "error", "revoked"]).nullable(),
  lastError: z.string().nullable(),
  connectedAt: z.string().nullable(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const OAuthStartRequestSchema = z.object({ services: z.array(GoogleServiceSchema).min(1) });
export const OAuthStartResponseSchema = z.object({ authUrl: z.string().url(), redirectUri: z.string() });
export const OAuthCompleteRequestSchema = z.object({ code: z.string().min(5).max(2000), state: z.string().min(10).max(4000) });

export const TASK_PRIORITIES = ["baixa", "normal", "alta"] as const;
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  space: SpaceSchema,
  priority: TaskPrioritySchema,
  dueDate: z.string().nullable(),
  remindAt: z.string().nullable(),
  status: z.enum(["aberta", "concluida"]),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD");
export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(2000).optional(),
  space: SpaceSchema.default("pessoal"),
  priority: TaskPrioritySchema.default("normal"),
  dueDate: DATE.optional(),
  /** Instante ISO com fuso (ex.: 2026-11-04T09:00:00-03:00). */
  remindAt: z.string().datetime({ offset: true }).optional(),
});
export type TaskCreate = z.input<typeof TaskCreateSchema>;

export const TaskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    notes: z.string().trim().max(2000).nullable(),
    space: SpaceSchema,
    priority: TaskPrioritySchema,
    dueDate: DATE.nullable(),
    remindAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(["aberta", "concluida"]),
  })
  .partial();
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;

export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  link: z.string().nullable(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const TodaySchema = z.object({
  date: z.string(),
  calendar: z.object({ connected: z.boolean(), events: z.array(CalendarEventSchema), error: z.string().nullable() }),
  tasks: z.array(TaskSchema),
  email: z.object({ connected: z.boolean(), importantUnread: z.number().nullable(), error: z.string().nullable() }),
});
export type Today = z.infer<typeof TodaySchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["resumo_diario", "lembrete_tarefa", "lembrete_reuniao", "sistema"]),
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AppNotification = z.infer<typeof NotificationSchema>;

export const PushTokenRequestSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/, "Token Expo inválido"),
  deviceName: z.string().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Fase 3 — contexto do aparelho, tokens de aparelho e intents (Siri/Atalhos)
// ---------------------------------------------------------------------------
export const DeviceContextSchema = z.object({
  calendar: z
    .array(z.object({ title: z.string().max(200), start: z.string().max(40), end: z.string().max(40), allDay: z.boolean(), calendar: z.string().max(100).optional() }))
    .max(40)
    .optional(),
  reminders: z.array(z.object({ title: z.string().max(300), due: z.string().max(40).nullable(), list: z.string().max(100).optional() })).max(40).optional(),
  location: z
    .object({ city: z.string().max(100).nullable(), region: z.string().max(100).nullable(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .optional(),
});
export type DeviceContext = z.infer<typeof DeviceContextSchema>;

export const DeviceActionReportSchema = z.object({
  success: z.boolean(),
  summary: z.string().trim().min(1).max(300),
});

export const DeviceTokenSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type DeviceToken = z.infer<typeof DeviceTokenSchema>;

export const DeviceTokenCreatedSchema = z.object({ id: z.string().uuid(), token: z.string().startsWith("jdt_") });

export const IntentSpeechSchema = z.object({ speech: z.string() });
export const IntentTaskRequestSchema = z.object({ titulo: z.string().trim().min(1).max(300) });
export const IntentMemoryRequestSchema = z.object({ texto: z.string().trim().min(2).max(2000) });

// ---------------------------------------------------------------------------
// Fase 4 — conectores empresariais, indicadores, relatórios e automações
// ---------------------------------------------------------------------------
export const CONNECTOR_TYPES = ["sir_alfred_hub", "google_sheets"] as const;
export const ConnectorTypeSchema = z.enum(CONNECTOR_TYPES);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export const SHEET_DATASETS = ["vendas", "estoque", "pedidos", "cronograma", "indicadores", "tabela"] as const;
export const SheetDatasetSchema = z.enum(SHEET_DATASETS);
export type SheetDataset = z.infer<typeof SheetDatasetSchema>;
export const SHEET_DATASET_LABELS: Record<SheetDataset, string> = {
  vendas: "Vendas",
  estoque: "Estoque",
  pedidos: "Pedidos",
  cronograma: "Cronograma / aulas",
  indicadores: "Indicadores e metas",
  tabela: "Tabela livre",
};

export const ConnectorSchema = z.object({
  id: z.string().uuid(),
  space: SpaceSchema,
  type: ConnectorTypeSchema,
  name: z.string(),
  config: z.record(z.string(), z.unknown()),
  accountLabel: z.string().nullable(),
  status: z.enum(["active", "error"]),
  lastError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Connector = z.infer<typeof ConnectorSchema>;

export const SheetConnectorCreateSchema = z.object({
  space: SpaceSchema,
  name: z.string().trim().min(1).max(100),
  /** URL da planilha (docs.google.com/spreadsheets/d/...) ou o ID. */
  spreadsheet: z.string().trim().min(10).max(500),
  /** Ex.: "Vendas!A1:H500". Padrão: primeira aba. */
  range: z.string().trim().max(100).optional(),
  dataset: SheetDatasetSchema,
});
export type SheetConnectorCreate = z.infer<typeof SheetConnectorCreateSchema>;

export const KpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number().nullable(),
  /** brl = reais; pct = %; count = quantidade; stars = 0–5 */
  unit: z.enum(["brl", "pct", "count", "stars", "text"]),
  text: z.string().optional(),
  /** Variação % contra o período anterior, quando disponível. */
  changePct: z.number().nullable().optional(),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const ConnectorMetricsSchema = z.object({
  connectorId: z.string(),
  connectorName: z.string(),
  type: ConnectorTypeSchema,
  period: z.string().nullable(),
  kpis: z.array(KpiSchema),
  highlights: z.array(z.string()),
  /** Alertas que merecem atenção (estoque baixo, avaliação ruim...). */
  alerts: z.array(z.string()),
  error: z.string().nullable(),
  fetchedAt: z.string(),
});
export type ConnectorMetrics = z.infer<typeof ConnectorMetricsSchema>;

export const SpaceOverviewSchema = z.object({
  space: SpaceSchema,
  connectors: z.array(ConnectorSchema),
  metrics: z.array(ConnectorMetricsSchema),
  openTasks: z.number(),
  memories: z.number(),
});
export type SpaceOverview = z.infer<typeof SpaceOverviewSchema>;

export const AUTOMATION_KINDS = ["relatorio_negocios", "pendencias", "tarefas_atrasadas", "alerta_estoque"] as const;
export const AutomationKindSchema = z.enum(AUTOMATION_KINDS);
export type AutomationKind = z.infer<typeof AutomationKindSchema>;
export const AUTOMATION_LABELS: Record<AutomationKind, string> = {
  relatorio_negocios: "Relatório semanal dos negócios",
  pendencias: "Relatório semanal de pendências",
  tarefas_atrasadas: "Alerta diário de tarefas atrasadas",
  alerta_estoque: "Alerta diário de estoque baixo",
};

export const AutomationSchema = z.object({
  id: z.string().uuid(),
  kind: AutomationKindSchema,
  space: SpaceSchema.nullable(),
  /** 0 = domingo … 6 = sábado; null = todos os dias. */
  weekday: z.number().int().min(0).max(6).nullable(),
  runTime: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
});
export type Automation = z.infer<typeof AutomationSchema>;

const HHMM4 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const AutomationCreateSchema = z.object({
  kind: AutomationKindSchema,
  space: SpaceSchema.nullable().default(null),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  runTime: HHMM4.default("08:00"),
  enabled: z.boolean().default(true),
});
export type AutomationCreate = z.input<typeof AutomationCreateSchema>;
export const AutomationUpdateSchema = z
  .object({ weekday: z.number().int().min(0).max(6).nullable(), runTime: HHMM4, enabled: z.boolean(), space: SpaceSchema.nullable() })
  .partial();

export const ReportSchema = z.object({
  id: z.string().uuid(),
  space: SpaceSchema.nullable(),
  kind: AutomationKindSchema,
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

// ---------------------------------------------------------------------------
// Fase 5 — streaming, rotinas, ações em lote
// ---------------------------------------------------------------------------
/** Eventos do POST /v1/chat/stream (Server-Sent Events). */
export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("tool"), event: ToolEventSchema }),
  z.object({ type: z.literal("done"), response: ChatResponseSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string(), status: z.number() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const RoutineSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  triggerPhrase: z.string(),
  instructions: z.string(),
  weekday: z.number().int().min(0).max(6).nullable(),
  runTime: z.string().nullable(),
  scheduleEnabled: z.boolean(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
});
export type Routine = z.infer<typeof RoutineSchema>;

const HHMM5 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const RoutineCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  triggerPhrase: z.string().trim().min(3).max(80),
  instructions: z.string().trim().min(5).max(2000),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  runTime: HHMM5.nullable().default(null),
  scheduleEnabled: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type RoutineCreate = z.input<typeof RoutineCreateSchema>;
export const RoutineUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    triggerPhrase: z.string().trim().min(3).max(80),
    instructions: z.string().trim().min(5).max(2000),
    weekday: z.number().int().min(0).max(6).nullable(),
    runTime: HHMM5.nullable(),
    scheduleEnabled: z.boolean(),
    enabled: z.boolean(),
  })
  .partial();

export const BatchConfirmRequestSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(10) });
