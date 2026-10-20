import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Raiz do monorepo (onde está tsconfig.base.json); caminhos relativos do .env partem dela. */
export function projectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "tsconfig.base.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(projectRoot(), p);
}

/**
 * Configuração centralizada, lida das variáveis de ambiente e validada.
 * Nenhuma chave privada é exposta ao navegador: este módulo só roda no servidor/worker.
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(16).default("dev-secret-change-me-dev-secret-change-me"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./data/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.default("true"),
  /**
   * true = navegador envia direto ao bucket (exige CORS com ETag exposto); false = upload passa pela aplicação;
   * auto = a aplicação configura o CORS do bucket para APP_URL e, se conseguir, usa o envio direto.
   */
  S3_DIRECT_UPLOAD: z.enum(["auto", "true", "false", "1", "0"]).default("auto").transform((v) => (v === "1" ? "true" : v === "0" ? "false" : v)),

  MAX_UPLOAD_MB: z.coerce.number().positive().default(4096),
  MULTIPART_PART_MB: z.coerce.number().min(5).default(16),
  SIGNED_URL_TTL_SEC: z.coerce.number().min(60).default(3600),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  FONTS_DIR: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_TMP_DIR: z.string().default("./data/tmp"),
  JOB_STALE_SECONDS: z.coerce.number().min(30).default(120),
  MAX_SOURCE_DURATION_MIN: z.coerce.number().positive().default(240),

  AI_PROVIDER: z.enum(["anthropic", "none"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  AI_VISION_FRAMES: z.coerce.number().int().min(0).max(20).default(10),
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().default(4),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().default(20),

  TRANSCRIPTION_PROVIDER: z.enum(["openai", "whisper_cpp", "none"]).optional(),
  OPENAI_API_KEY: z.string().optional(),
  /** Trilha sonora e narração geradas por IA (licença comercial conforme o plano da conta ElevenLabs). */
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_TTS_MODEL: z.string().default("eleven_multilingual_v2"),
  /** Duração máxima de trilha gerada por vídeo (segundos), para controlar créditos. */
  ELEVENLABS_MAX_MUSIC_SEC: z.coerce.number().min(10).max(300).default(90),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  TRANSCRIPTION_PRICE_PER_MIN: z.coerce.number().default(0.006),
  WHISPER_CPP_BIN: z.string().optional(),
  WHISPER_CPP_MODEL: z.string().optional(),

  MONTHLY_AI_BUDGET_USD: z.coerce.number().min(0).default(20),
  STORAGE_LIMIT_GB: z.coerce.number().min(0).default(50),
  MONTHLY_RENDER_MINUTES: z.coerce.number().min(0).default(600),
  ALLOW_SIGNUP: bool.default("true"),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  aiProvider: "anthropic" | "none";
  transcriptionProvider: "openai" | "whisper_cpp" | "none";
};

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const env = EnvSchema.parse(process.env);
  if (env.NODE_ENV === "production" && env.APP_SECRET.startsWith("dev-secret")) {
    throw new Error("APP_SECRET precisa ser definido em produção.");
  }
  const aiProvider = env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "none");
  const transcriptionProvider =
    env.TRANSCRIPTION_PROVIDER ?? (env.OPENAI_API_KEY ? "openai" : env.WHISPER_CPP_BIN && env.WHISPER_CPP_MODEL ? "whisper_cpp" : "none");
  cached = {
    ...env,
    LOCAL_STORAGE_DIR: resolvePath(env.LOCAL_STORAGE_DIR),
    WORKER_TMP_DIR: resolvePath(env.WORKER_TMP_DIR),
    FONTS_DIR: env.FONTS_DIR ? resolvePath(env.FONTS_DIR) : undefined,
    aiProvider,
    transcriptionProvider,
  };
  return cached;
}

/** Usado em testes para recarregar a configuração. */
export function resetConfig(): void {
  cached = null;
}

/** Capacidades realmente disponíveis — mostradas na interface sem exagero. */
export function capabilities() {
  const c = getConfig();
  return {
    ai: c.aiProvider !== "none" && (c.aiProvider !== "anthropic" || Boolean(c.ANTHROPIC_API_KEY)),
    aiModel: c.aiProvider === "anthropic" ? c.AI_MODEL : null,
    visionFrames: c.aiProvider === "anthropic" ? c.AI_VISION_FRAMES : 0,
    transcription:
      (c.transcriptionProvider === "openai" && Boolean(c.OPENAI_API_KEY)) ||
      (c.transcriptionProvider === "whisper_cpp" && Boolean(c.WHISPER_CPP_BIN && c.WHISPER_CPP_MODEL)),
    transcriptionProvider: c.transcriptionProvider,
    storage: c.STORAGE_DRIVER,
    maxUploadMb: c.MAX_UPLOAD_MB,
    publishing: false,
    musicLibrary: false,
    aiMusic: Boolean(c.ELEVENLABS_API_KEY),
    tts: Boolean(c.ELEVENLABS_API_KEY),
  };
}
export type Capabilities = ReturnType<typeof capabilities>;
