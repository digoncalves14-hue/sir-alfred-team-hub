/** Leitura tolerante de planilhas brasileiras: números ("R$ 1.234,56"), datas ("05/11/2026") e cabeçalhos. */

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "R$ 1.234,56" → 1234.56; "1,234.56" → 1234.56; "85%" → 85; vazio/inválido → null. */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/^R\$\s*/i, ""));
  s = s.replace(/[R$\s%()]/gi, "").replace(/^-/, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** "05/11/2026", "5/11/26", "2026-11-05", "05/11/2026 14:30" → "2026-11-05". */
export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  // Ano com 4 dígitos primeiro (senão "2026" casaria como "20").
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    const month = Number(m[2]);
    const day = Number(m[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function parseTime(raw: string | undefined | null): string | null {
  const m = String(raw ?? "").match(/(\d{1,2})[:h](\d{2})?/i);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

export interface Table {
  headers: string[];
  rows: Record<string, string>[];
}

/** Primeira linha não vazia = cabeçalho; ignora linhas totalmente vazias. */
export function toTable(values: string[][]): Table {
  const start = values.findIndex((r) => r.some((c) => c.trim()));
  if (start < 0) return { headers: [], rows: [] };
  const headers = values[start]!.map((h, i) => h.trim() || `coluna ${i + 1}`);
  const rows = values
    .slice(start + 1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

/** Encontra a coluna cujo cabeçalho combina com algum sinônimo (exato > começa com > contém). */
export function findColumn(headers: string[], synonyms: string[]): string | null {
  const norm = headers.map((h) => ({ h, n: normalizeHeader(h) }));
  for (const test of [(n: string, s: string) => n === s, (n: string, s: string) => n.startsWith(s), (n: string, s: string) => n.includes(s)]) {
    for (const s of synonyms) {
      const hit = norm.find(({ n }) => test(n, s));
      if (hit) return hit.h;
    }
  }
  return null;
}

export const SYNONYMS = {
  valor: ["valor total", "total", "valor", "receita", "faturamento", "montante", "preco total", "venda"],
  quantidade: ["quantidade", "qtd", "qtde", "unidades", "estoque atual", "estoque", "saldo"],
  produto: ["produto", "item", "descricao", "sku", "nome"],
  data: ["data", "dia", "data da venda", "data do pedido", "emissao"],
  minimo: ["estoque minimo", "minimo", "min", "ponto de pedido"],
  status: ["status", "situacao", "etapa"],
  pedido: ["pedido", "numero", "n pedido", "codigo", "id"],
  cliente: ["cliente", "comprador", "aluno", "nome do cliente"],
  atividade: ["atividade", "aula", "evento", "turma", "titulo", "tema", "descricao"],
  hora: ["horario", "hora", "inicio"],
  indicador: ["indicador", "kpi", "metrica", "nome"],
  meta: ["meta", "objetivo", "alvo"],
} as const;
