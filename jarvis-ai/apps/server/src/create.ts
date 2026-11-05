import { isWebAppAvailable } from "./web/static";
import type { Config } from "./config";
import { buildApp } from "./app";
import { AnthropicProvider } from "./ai/anthropic";
import { Orchestrator } from "./agent/orchestrator";
import { createDefaultRegistry } from "./tools/builtin";
import { createSupabaseAuthenticator, parseAllowedEmails } from "./auth";
import { ElevenLabsTts } from "./tts/elevenlabs";
import { SecretBox } from "./security/crypto";
import { createServiceClient, SupabaseSystemStore } from "./store/supabase-system-store";
import { GoogleOAuth } from "./google/oauth";
import { GoogleGateway } from "./google/gateway";
import { ExpoPushSender } from "./push/expo";
import { Scheduler } from "./scheduler/scheduler";
import { ConnectorService } from "./business/connectors";
import { HubOAuth } from "./business/hub";
import { ReportGenerator } from "./business/reports";
import { MemoryIndex } from "./memory/index";
import { VoyageEmbeddings } from "./ai/embeddings";

/**
 * Monta o servidor completo do Jarvis a partir da configuração.
 * Usado pelo servidor tradicional (index.ts) e pela função da Vercel (vercel.ts).
 */
export async function createJarvis(config: Config, opts: { startScheduler?: boolean } = {}) {
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
  const vercelUrl = config.VERCEL_PROJECT_PRODUCTION_URL ? `https://${config.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}` : "";
  const publicUrl = (config.PUBLIC_URL ?? config.RENDER_EXTERNAL_URL ?? vercelUrl).replace(/\/+$/, "") || null;
  const googleOAuth = !box
    ? null
    : config.GOOGLE_WEB_CLIENT_ID && config.GOOGLE_WEB_CLIENT_SECRET && publicUrl
      ? new GoogleOAuth(config.GOOGLE_WEB_CLIENT_ID, box, fetch, { clientSecret: config.GOOGLE_WEB_CLIENT_SECRET, redirectUri: `${publicUrl}/google-oauth` })
      : config.GOOGLE_IOS_CLIENT_ID
        ? new GoogleOAuth(config.GOOGLE_IOS_CLIENT_ID, box)
        : null;
  const google = system && box && googleOAuth ? new GoogleGateway({ oauth: googleOAuth, system, box }) : null;

  // ---- Fase 4: conectores empresariais e relatórios ----
  const hub =
    box && config.HUB_SUPABASE_URL && config.HUB_PUBLISHABLE_KEY && config.HUB_OAUTH_CLIENT_ID
      ? new HubOAuth({ url: config.HUB_SUPABASE_URL, publishableKey: config.HUB_PUBLISHABLE_KEY, clientId: config.HUB_OAUTH_CLIENT_ID }, box)
      : null;
  const connectors = system && box ? new ConnectorService({ system, box, google, hub }) : null;
  const reports = system ? new ReportGenerator({ system, connectors }) : null;

  // ---- Fase 5: memória semântica opcional ----
  const memory = new MemoryIndex(
    config.VOYAGE_API_KEY
      ? new VoyageEmbeddings({ apiKey: config.VOYAGE_API_KEY, model: config.EMBEDDINGS_MODEL, pricePerMTokens: config.EMBEDDINGS_PRICE_PER_MTOKENS_USD })
      : null,
  );

  let scheduler: Scheduler | null = null;

  const app = await buildApp({
    authenticate: createSupabaseAuthenticator(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, parseAllowedEmails(config.ALLOWED_EMAILS)),
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
      business: connectors && reports ? { connectors, reports } : null,
      memory,
      economyModel: config.AI_MODEL_ECONOMY,
    }),
    memory,
    economyModel: config.AI_MODEL_ECONOMY,
    phase4: { system, box, connectors, reports },
    phase2: { system, google, box },
    get scheduler() {
      return scheduler;
    },
    cronSecret: config.CRON_SECRET,
    trustProxy: config.TRUST_PROXY,
    web: isWebAppAvailable(config.WEB_DIR)
      ? { dir: config.WEB_DIR, supabaseUrl: config.SUPABASE_URL, supabaseAnonKey: config.SUPABASE_ANON_KEY }
      : null,
  });

  if (system) {
    scheduler = new Scheduler({
      system,
      google,
      reports,
      push: new ExpoPushSender(system, { accessToken: config.EXPO_ACCESS_TOKEN, log: app.log }),
      log: app.log,
    });
    if (config.SCHEDULER_ENABLED && opts.startScheduler !== false) scheduler.start(config.SCHEDULER_INTERVAL_SECONDS * 1000);
  }

  app.log.info(
    {
      model: provider.model,
      aiConfigured: provider.configured,
      effort: config.AI_EFFORT,
      google: Boolean(google),
      push: Boolean(system),
      scheduler: Boolean(system && config.SCHEDULER_ENABLED),
      hub: Boolean(hub),
      semanticMemory: memory.semantic,
    },
    provider.configured ? "JARVIS iniciado" : "ATENÇÃO: ANTHROPIC_API_KEY ausente — /v1/chat responderá 503",
  );
  if (!system) app.log.warn("SUPABASE_SERVICE_ROLE_KEY ausente: integrações Google, push e agendador desativados.");

  return { app, scheduler };
}
