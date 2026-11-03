/**
 * Memória contextual (Fase 5): busca HÍBRIDA = semântica (embeddings, quando configurados)
 * + palavras-chave (sempre). Encontra "o que decidimos sobre o frasco da pomada?" mesmo que
 * a memória diga "embalagem do produto da Black Bear".
 * Os vetores ficam no próprio registro da memória; a similaridade é calculada no servidor
 * (cada usuário tem poucas centenas de memórias — não exige pgvector).
 */
import type { Memory } from "@jarvis/shared";
import { cosine, type EmbeddingsProvider } from "../ai/embeddings";
import { scoreText, searchTerms } from "../store/search";
import type { MemoryQuery, UserStore } from "../store/types";

const SEMANTIC_MIN = 0.35;

export class MemoryIndex {
  constructor(private readonly embeddings: EmbeddingsProvider | null) {}

  get semantic() {
    return this.embeddings !== null;
  }

  private async record(store: UserStore, tokens: number) {
    if (!this.embeddings) return;
    await store.recordUsage({
      kind: "embedding",
      provider: "voyage",
      model: this.embeddings.model,
      inputTokens: tokens,
      costUsd: (tokens / 1_000_000) * this.embeddings.pricePerMTokens,
    });
  }

  /** Calcula e salva o vetor da memória (melhor esforço: falha não impede salvar a memória). */
  async index(store: UserStore, memory: Memory): Promise<boolean> {
    if (!this.embeddings) return false;
    try {
      const { vectors, tokens } = await this.embeddings.embed([memory.content], "document");
      await store.setMemoryEmbedding(memory.id, vectors[0]!, this.embeddings.model);
      await this.record(store, tokens);
      return true;
    } catch {
      return false;
    }
  }

  /** Reindexa memórias sem vetor (ex.: criadas antes de configurar os embeddings). */
  async reindex(store: UserStore): Promise<number> {
    if (!this.embeddings) return 0;
    const done = new Set((await store.listMemoryEmbeddings(this.embeddings.model)).map((e) => e.id));
    const pending = (await store.listMemories({ limit: 1000 })).filter((m) => !done.has(m.id));
    let count = 0;
    for (let i = 0; i < pending.length; i += 64) {
      const batch = pending.slice(i, i + 64);
      const { vectors, tokens } = await this.embeddings.embed(batch.map((m) => m.content), "document");
      for (const [j, m] of batch.entries()) await store.setMemoryEmbedding(m.id, vectors[j]!, this.embeddings.model);
      await this.record(store, tokens);
      count += batch.length;
    }
    return count;
  }

  async search(store: UserStore, q: MemoryQuery): Promise<Memory[]> {
    const limit = q.limit ?? 8;
    if (!this.embeddings || !q.query?.trim()) return store.listMemories({ ...q, limit });

    const candidates = await store.listMemories({ category: q.category, space: q.space, limit: 1000 });
    if (candidates.length === 0) return [];
    let queryVec: number[] | null = null;
    try {
      const { vectors, tokens } = await this.embeddings.embed([q.query], "query");
      queryVec = vectors[0]!;
      await this.record(store, tokens);
    } catch {
      return store.listMemories({ ...q, limit }); // serviço fora do ar: palavras-chave
    }
    const vecs = new Map((await store.listMemoryEmbeddings(this.embeddings.model)).map((e) => [e.id, e.embedding]));
    const terms = searchTerms(q.query);
    return candidates
      .map((m) => {
        const v = vecs.get(m.id);
        const sem = v ? cosine(queryVec!, v) : 0;
        const kw = terms.length ? scoreText(m.content, terms) / terms.length : 0;
        return { m, sem, kw, score: 0.75 * sem + 0.25 * kw };
      })
      .filter((x) => x.sem >= SEMANTIC_MIN || x.kw > 0)
      .sort((a, b) => b.score - a.score || b.m.updatedAt.localeCompare(a.m.updatedAt))
      .slice(0, limit)
      .map((x) => x.m);
  }
}
