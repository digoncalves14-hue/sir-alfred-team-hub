import { loadConfig } from "./config";
import { buildApp } from "./app";
import { AnthropicProvider } from "./ai/anthropic";
import { Orchestrator } from "./agent/orchestrator";
import { createDefaultRegistry } from "./tools/builtin";
import { createSupabaseAuthenticator } from "./auth";
import { ElevenLabsTts } from "./tts/elevenlabs";

const config = loadConfig();

const provider = new AnthropicProvider({
  apiKey: config.ANTHROPIC_API_KEY,
  baseURL: config.ANTHROPIC_BASE_URL,
  model: config.AI_MODEL,
  effort: config.AI_EFFORT,
  fallbacks: config.AI_FALLBACKS,
});

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
  }),
});

app.log.info(
  { model: provider.model, aiConfigured: provider.configured, effort: config.AI_EFFORT },
  provider.configured ? "IA configurada" : "ATENÇÃO: ANTHROPIC_API_KEY ausente — /v1/chat responderá 503",
);

// Logs do orquestrador usam o logger estruturado do Fastify.
const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
