/**
 * Embeddings opcionais para memória semântica (Voyage AI, recomendada pela Anthropic).
 * Sem VOYAGE_API_KEY, a memória continua com a busca por palavras (custo zero).
 * API: POST https://api.voyageai.com/v1/embeddings
 */
export interface EmbeddingsProvider {
  readonly model: string;
  /** Preço estimado por 1 milhão de tokens (USD), para o painel de consumo. */
  readonly pricePerMTokens: number;
  embed(texts: string[], kind: "document" | "query"): Promise<{ vectors: number[][]; tokens: number }>;
}

export class VoyageEmbeddings implements EmbeddingsProvider {
  constructor(
    private readonly opts: { apiKey: string; model: string; pricePerMTokens: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model() {
    return this.opts.model;
  }
  get pricePerMTokens() {
    return this.opts.pricePerMTokens;
  }

  async embed(texts: string[], kind: "document" | "query") {
    const res = await this.fetchImpl("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${this.opts.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ input: texts, model: this.opts.model, input_type: kind }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Voyage respondeu ${res.status}`);
    const body = (await res.json()) as { data: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number } };
    const vectors = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { vectors, tokens: body.usage?.total_tokens ?? Math.ceil(texts.join(" ").length / 4) };
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
