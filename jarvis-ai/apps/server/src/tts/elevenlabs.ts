/**
 * Voz premium opcional via API REST da ElevenLabs (texto → MP3).
 * A chave fica apenas no backend. Sem configuração, o app usa a voz nativa do iOS.
 * Referência: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 */
export interface TtsProvider {
  readonly name: string;
  readonly configured: boolean;
  readonly model: string;
  synthesize(text: string): Promise<{ audio: Buffer; contentType: string }>;
}

export class ElevenLabsTts implements TtsProvider {
  readonly name = "elevenlabs";
  constructor(
    private readonly opts: { apiKey?: string; voiceId?: string; modelId: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.opts.apiKey && this.opts.voiceId);
  }
  get model() {
    return this.opts.modelId;
  }

  async synthesize(text: string) {
    if (!this.configured) throw new Error("Voz premium não configurada.");
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.opts.voiceId!)}?output_format=mp3_44100_64`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "xi-api-key": this.opts.apiKey!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: this.opts.modelId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`ElevenLabs respondeu ${res.status}: ${detail}`);
    }
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
  }
}
