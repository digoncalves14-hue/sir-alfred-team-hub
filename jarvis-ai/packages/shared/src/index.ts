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
export const ProfileSchema = z.object({
  ownerName: z.string(),
  assistantName: z.string(),
  memoryEnabled: z.boolean(),
  timezone: z.string(),
  dailyCostLimitUsd: z.number(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ProfileUpdateSchema = z
  .object({
    ownerName: z.string().trim().min(1).max(60),
    assistantName: z.string().trim().min(1).max(30),
    memoryEnabled: z.boolean(),
    timezone: z.string().trim().min(3).max(64),
    dailyCostLimitUsd: z.number().min(0).max(100),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------
/** Resultado de uma ferramenta, exibido como feedback visual no app. */
export const ToolEventSchema = z.object({
  tool: z.string(),
  label: z.string(),
  /** executed = executada de verdade; pending = aguardando autorização; failed = erro; rejected = negada pelo usuário */
  status: z.enum(["executed", "pending", "failed", "rejected"]),
  summary: z.string(),
  pendingActionId: z.string().uuid().optional(),
});
export type ToolEvent = z.infer<typeof ToolEventSchema>;

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  /** Origem do texto: voz (transcrição) ou digitação. */
  inputMode: z.enum(["voice", "text"]).default("text"),
  /** Fuso do aparelho (IANA), usado para interpretar datas relativas. */
  timezone: z.string().max(64).optional(),
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
});
export type Health = z.infer<typeof HealthSchema>;

export const TtsRequestSchema = z.object({ text: z.string().trim().min(1).max(1500) });

/** Erro padronizado da API. */
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;
