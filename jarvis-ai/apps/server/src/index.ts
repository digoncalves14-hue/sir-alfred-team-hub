import { loadConfig } from "./config";
import { buildApp } from "./app";
import { AnthropicProvider } from "./ai/anthropic";
import { Orchestrator } from "./agent/orchestrator";
import { createDefaultRegistry } from "./tools/builtin";
import { createSupabaseAuthenticator } from "./auth";
import { ElevenLabsTts } from "./tts/elevenlabs";
import { SecretBox } from "./security/crypto";
import { createServiceClient, SupabaseSystemStore } from "./store/supabase-system-store";
import { GoogleOAuth } from "./google/oauth";
import { GoogleGateway } from "./google/gateway";
import { ExpoPushSender } from "./push/expo";
import { Scheduler } from "./scheduler/scheduler";

const config = loadConfig();

const provider = new AnthropicProvider({
  apiKey: config.ANTHROPIC_API_KEY,
  baseURL: config.ANTHROPIC_BASE_URL,
  model: config.AI_MODEL,
  effort: config.AI_EFFORT,
  fallbacks: config.AI_FALLBACKS,
});

// ---- Fase 2: componentes opcionais (desligados com clareza se faltar configuração) ----
const system = config.SUPABASE_SERVICE_ROLE_KEY
  ? new SupabaseSystemStore(createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY))
  : null;
const box = config.TOKEN_ENCRYPTION_KEY ? new SecretBox(config.TOKEN_ENCRYPTION_KEY) : null;
const google =
  system && box && config.GOOGLE_IOS_CLIENT_ID ? new GoogleGateway({ oauth: new GoogleOAuth(config.GOOGLE_IOS_CLIENT_ID, box), system, box }) : null;

let scheduler: Scheduler | null = null;

const app = await buildApp({
  authenticate: createSupabaseAuthenticator(config.SUPABASE_URL, config.SUPABASE_ANON_KEY),
  provider,
  tts: new ElevenLabsTts({ apiKey: config.ELEVENLABS_API_KEY, voiceId: config.ELEVENLABS_VOICE_ID, modelId: config.ELEVENLABS_MODEL_ID }),
  ttsCostPer1kChars: config.TTS_COST_PER_1K_CHARS_USD,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  logLevel: config.LOG_LEVEL,
  orchestrator: new Orchestrator({
    provider,
    registry: createDefaultRegistry(),
    maxToolIterations: config.AI_MAX_TOOL_ITERATIONS,
    historyMessages: config.AI_HISTORY_MESSAGES,
    googleFor: google ? (userId) => google.forUser(userId) : undefined,
  }),
  phase2: { system, google, box },
  get scheduler() {
    return scheduler;
  },
  cronSecret: config.CRON_SECRET,
});

if (system) {
  scheduler = new Scheduler({
    system,
    google,
    push: new ExpoPushSender(system, { accessToken: config.EXPO_ACCESS_TOKEN, log: app.log }),
    log: app.log,
  });
  if (config.SCHEDULER_ENABLED) scheduler.start(config.SCHEDULER_INTERVAL_SECONDS * 1000);
}

app.log.info(
  {
    model: provider.model,
    aiConfigured: provider.configured,
    effort: config.AI_EFFORT,
    google: Boolean(google),
    push: Boolean(system),
    scheduler: Boolean(system && config.SCHEDULER_ENABLED),
  },
  provider.configured ? "JARVIS iniciado" : "ATENÇÃO: ANTHROPIC_API_KEY ausente — /v1/chat responderá 503",
);
if (!system) app.log.warn("SUPABASE_SERVICE_ROLE_KEY ausente: integrações Google, push e agendador desativados.");

const shutdown = async () => {
  scheduler?.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
