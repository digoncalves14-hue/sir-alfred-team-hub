import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Supabase — somente URL e chave pública (publishable/anon). O backend age
  // sempre com o JWT do usuário, então o RLS do banco continua valendo.
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),

  // IA (Claude). A chave fica somente no backend.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  AI_FALLBACKS: bool.default(true),
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).max(16).default(8),
  // Modelo usado quando o usuário liga o "modo econômico" (e para resumir conversas longas).
  AI_MODEL_ECONOMY: z.string().default("claude-sonnet-5-5"),
  AI_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(60).default(20),

  // Voz premium opcional (ElevenLabs). Sem chave, o app usa a voz nativa do iOS (gratuita).
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_flash_v2_5"),
  TTS_COST_PER_1K_CHARS_USD: z.coerce.number().min(0).default(0.1),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),

  // ---- Fase 2 ----
  // service_role: SOMENTE no backend. Necessária para OAuth (gravar token cifrado),
  // push e agendador (que rodam sem o usuário estar logado).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  // 32 bytes em base64 (openssl rand -base64 32). Cifra os tokens do Google.
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // ID do cliente OAuth do tipo iOS (Google Cloud Console). Sem client secret.
  GOOGLE_IOS_CLIENT_ID: z.string().regex(/\.apps\.googleusercontent\.com$/, "deve terminar em .apps.googleusercontent.com").optional(),
  // Opcional: token de acesso da Expo se você ativar "push security" no projeto.
  EXPO_ACCESS_TOKEN: z.string().optional(),
  SCHEDULER_ENABLED: bool.default(true),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  // Protege POST /internal/cron/tick (para cron externo quando o servidor "dorme").
  CRON_SECRET: z.string().min(16).optional(),

  // ---- Fase 4: Sir Alfred Team Hub (Supabase do app da equipe como servidor OAuth 2.1) ----
  HUB_SUPABASE_URL: z.string().url().optional(),
  // Chave PÚBLICA (publishable/anon) do Hub — não é segredo.
  HUB_PUBLISHABLE_KEY: z.string().min(20).optional(),
  // client_id do app OAuth "JARVIS AI" cadastrado no Hub (cliente público, sem segredo).
  HUB_OAUTH_CLIENT_ID: z.string().min(8).optional(),

  // ---- Fase 5: memória semântica opcional (Voyage AI) ----
  VOYAGE_API_KEY: z.string().min(10).optional(),
  EMBEDDINGS_MODEL: z.string().default("voyage-3.5-lite"),
  EMBEDDINGS_PRICE_PER_MTOKENS_USD: z.coerce.number().min(0).default(0.02),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida do servidor. Verifique o arquivo .env:\n${issues}`);
  }
  return parsed.data;
}
