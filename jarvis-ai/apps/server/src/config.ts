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
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).max(12).default(6),
  AI_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(60).default(20),

  // Voz premium opcional (ElevenLabs). Sem chave, o app usa a voz nativa do iOS (gratuita).
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_flash_v2_5"),
  TTS_COST_PER_1K_CHARS_USD: z.coerce.number().min(0).default(0.1),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
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
