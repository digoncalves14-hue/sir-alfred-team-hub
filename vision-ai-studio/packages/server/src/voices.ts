import { getConfig } from "./config";
import { log } from "./logger";

export interface VoiceOption {
  id: string;
  name: string;
  gender: "feminina" | "masculina" | null;
  /** Descrição curta: sotaque, estilo, idade. */
  description: string;
  /** Fala português (verificado pela ElevenLabs ou pelo sotaque/idioma). */
  portuguese: boolean;
  previewUrl: string | null;
}

interface RawVoice {
  voice_id: string;
  name?: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
  verified_languages?: Array<{ language?: string; preview_url?: string | null }>;
}

let cache: { at: number; voices: VoiceOption[] } | null = null;

/**
 * Vozes disponíveis na conta ElevenLabs (as da biblioteca da conta e as padrão),
 * com as que falam português primeiro. Usa a API REST direto para não depender
 * do SDK no servidor web. Fica em cache por 10 minutos.
 */
export async function listVoices(): Promise<VoiceOption[]> {
  const key = getConfig().ELEVENLABS_API_KEY;
  if (!key) return [];
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.voices;
  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false", {
    headers: { "xi-api-key": key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    log.warn("elevenlabs_voices_failed", { status: res.status });
    throw new Error(res.status === 401 ? "A chave da ElevenLabs não tem permissão para ler as vozes (marque Vozes: Ler na chave)." : `A ElevenLabs respondeu ${res.status} ao listar as vozes.`);
  }
  const body = (await res.json()) as { voices?: RawVoice[] };
  const voices = (body.voices ?? []).map(toOption);
  voices.sort((a, b) => Number(b.portuguese) - Number(a.portuguese) || a.name.localeCompare(b.name, "pt-BR"));
  cache = { at: Date.now(), voices };
  return voices;
}

function toOption(v: RawVoice): VoiceOption {
  const l = v.labels ?? {};
  const g = (l.gender ?? "").toLowerCase();
  const ptLang = v.verified_languages?.find((x) => x.language === "pt");
  const portuguese = Boolean(ptLang) || /portugu|brazil/i.test(`${l.language ?? ""} ${l.accent ?? ""}`);
  const description = [l.accent, l.descriptive ?? l.description, l.age, l.use_case]
    .filter((x): x is string => Boolean(x))
    .map((x) => x.replace(/_/g, " "))
    .join(" · ");
  return {
    id: v.voice_id,
    name: v.name ?? v.voice_id,
    gender: g === "female" ? "feminina" : g === "male" ? "masculina" : null,
    description,
    portuguese,
    previewUrl: ptLang?.preview_url ?? v.preview_url ?? null,
  };
}
