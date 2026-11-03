/** Utilitários de busca textual em português (sem embeddings, custo zero). */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra " +
    "com sem sobre entre e ou mas que se como qual quais quando onde quem foi era sao ser estar esta " +
    "isso isto aquilo ele ela eles elas eu voce nos nosso nossa nossos nossas meu minha meus minhas " +
    "seu sua seus suas ao aos lhe me te mais menos muito muita ja ainda tem ter teve ultima ultimo " +
    "jarvis senhor favor"
  ).split(/\s+/),
);

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Extrai termos relevantes (sem acento, sem stopwords, sem caracteres de sintaxe). */
export function searchTerms(query: string, max = 8): string[] {
  const seen = new Set<string>();
  for (const raw of normalize(query).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Pontuação simples: quantos termos aparecem (por prefixo de 5 letras, tolera flexões). */
export function scoreText(text: string, terms: string[]): number {
  const hay = normalize(text);
  let score = 0;
  for (const t of terms) {
    const stem = t.length > 5 ? t.slice(0, 5) : t;
    if (hay.includes(stem)) score += 1;
  }
  return score;
}


/**
 * Ordena memórias por relevância para a consulta (insensível a acentos) e,
 * em empate, pelas mais recentes. Sem consulta, mantém a ordem recebida.
 */
export function rankByQuery<T extends { content: string; updatedAt: string }>(items: T[], query: string | undefined, limit: number): T[] {
  const terms = query ? searchTerms(query) : [];
  if (terms.length === 0) return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: scoreText(item.content, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
    .slice(0, limit)
    .map((x) => x.item);
}
