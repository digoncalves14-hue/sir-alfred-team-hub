/**
 * Cálculo DETERMINÍSTICO de indicadores (sem IA, sem custo):
 *  - planilhas (vendas, estoque, pedidos, cronograma, indicadores, tabela);
 *  - Sir Alfred Team Hub (desempenho da equipe, produtos, avaliações).
 * Os números vêm só dos dados; nada é estimado ou inventado.
 */
import type { Kpi, SheetDataset } from "@jarvis/shared";
import { findColumn, parseDate, parseNumber, parseTime, SYNONYMS, type Table } from "./parse";
import { addDays } from "../agent/time";

export interface MetricsCore {
  period: string | null;
  kpis: Kpi[];
  highlights: string[];
  alerts: string[];
}

/** "R$ 1.234,56" com espaço comum (o Intl usa espaço inseparável, ruim para notificações e fala). */
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

const DONE_STATUS = /entreg|conclu|finaliz|cancel|pago e enviado|devolvid/i;

// ---------------------------------------------------------------------------
// Planilhas
// ---------------------------------------------------------------------------
export function sheetMetrics(dataset: SheetDataset, table: Table, today: string): MetricsCore {
  const col = (k: keyof typeof SYNONYMS) => findColumn(table.headers, [...SYNONYMS[k]]);
  const rows = table.rows;
  switch (dataset) {
    case "vendas": {
      const cValor = col("valor");
      const cData = col("data");
      const cProduto = col("produto");
      const cQtd = col("quantidade");
      if (!cValor) return missing("valor/total");
      const all = rows.map((r) => ({ v: parseNumber(r[cValor]), d: cData ? parseDate(r[cData]) : null, p: cProduto ? r[cProduto] : "", q: cQtd ? parseNumber(r[cQtd]) : null }));
      const valid = all.filter((x) => x.v !== null) as { v: number; d: string | null; p: string; q: number | null }[];
      const hasDates = valid.some((x) => x.d);
      const from = addDays(today, -29);
      const prevFrom = addDays(today, -59);
      const cur = hasDates ? valid.filter((x) => x.d && x.d >= from && x.d <= today) : valid;
      const prev = hasDates ? valid.filter((x) => x.d && x.d >= prevFrom && x.d < from) : [];
      const total = cur.reduce((s, x) => s + x.v, 0);
      const prevTotal = prev.reduce((s, x) => s + x.v, 0);
      const byProduct = new Map<string, number>();
      for (const x of cur) if (x.p) byProduct.set(x.p, (byProduct.get(x.p) ?? 0) + x.v);
      const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1]);
      return {
        period: hasDates ? `últimos 30 dias (${from} a ${today})` : "todas as linhas",
        kpis: [
          { key: "faturamento", label: "Faturamento", value: round2(total), unit: "brl", changePct: hasDates ? pct(total, prevTotal) : null },
          { key: "vendas", label: "Vendas", value: cur.length, unit: "count" },
          { key: "ticket", label: "Ticket médio", value: cur.length ? round2(total / cur.length) : null, unit: "brl" },
          ...(cQtd ? [{ key: "itens", label: "Itens vendidos", value: cur.reduce((s, x) => s + (x.q ?? 0), 0), unit: "count" as const }] : []),
          ...(top[0] ? [{ key: "top_produto", label: "Mais vendido", value: null, unit: "text" as const, text: top[0][0] }] : []),
        ],
        highlights: top.slice(0, 3).map(([p, v], i) => `${i + 1}º ${p}: ${brl(v)}`),
        alerts: [],
      };
    }
    case "estoque": {
      const cProduto = col("produto");
      const cQtd = col("quantidade");
      const cMin = col("minimo");
      if (!cProduto || !cQtd) return missing("produto e quantidade");
      const items = rows.map((r) => ({ p: r[cProduto]!, q: parseNumber(r[cQtd]), m: cMin ? parseNumber(r[cMin]) : null })).filter((x) => x.p && x.q !== null);
      const zero = items.filter((x) => (x.q ?? 0) <= 0);
      const low = items.filter((x) => x.q! > 0 && x.m !== null && x.q! <= x.m);
      return {
        period: "posição atual",
        kpis: [
          { key: "itens", label: "Itens", value: items.length, unit: "count" },
          { key: "abaixo_minimo", label: "Abaixo do mínimo", value: cMin ? low.length : null, unit: "count", ...(cMin ? {} : { text: "sem coluna de mínimo" }) },
          { key: "zerados", label: "Zerados", value: zero.length, unit: "count" },
        ],
        highlights: [],
        alerts: [
          ...zero.slice(0, 10).map((x) => `${x.p}: SEM ESTOQUE`),
          ...low.slice(0, 10).map((x) => `${x.p}: ${x.q} (mínimo ${x.m})`),
        ],
      };
    }
    case "pedidos": {
      const cStatus = col("status");
      const cValor = col("valor");
      const cData = col("data");
      const cPedido = col("pedido");
      const list = rows.map((r) => ({
        s: cStatus ? r[cStatus] || "sem status" : "sem status",
        v: cValor ? parseNumber(r[cValor]) : null,
        d: cData ? parseDate(r[cData]) : null,
        id: cPedido ? r[cPedido] : "",
      }));
      const open = list.filter((x) => !DONE_STATUS.test(x.s));
      const byStatus = new Map<string, number>();
      for (const x of list) byStatus.set(x.s, (byStatus.get(x.s) ?? 0) + 1);
      const stale = open.filter((x) => x.d && x.d <= addDays(today, -7));
      return {
        period: "todos os pedidos da planilha",
        kpis: [
          { key: "pedidos", label: "Pedidos", value: list.length, unit: "count" },
          { key: "em_aberto", label: "Em aberto", value: open.length, unit: "count" },
          ...(cValor ? [{ key: "valor_aberto", label: "Valor em aberto", value: round2(open.reduce((s, x) => s + (x.v ?? 0), 0)), unit: "brl" as const }] : []),
        ],
        highlights: [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}: ${n}`),
        alerts: stale.slice(0, 10).map((x) => `Pedido ${x.id || "(sem número)"} em "${x.s}" desde ${x.d}`),
      };
    }
    case "cronograma": {
      const cData = col("data");
      const cAtiv = col("atividade");
      const cHora = col("hora");
      if (!cData) return missing("data");
      const until = addDays(today, 7);
      const upcoming = rows
        .map((r) => ({ d: parseDate(r[cData]), t: cHora ? parseTime(r[cHora]) : null, a: cAtiv ? r[cAtiv] : Object.values(r).find((v, i) => i > 0 && v) ?? "" }))
        .filter((x) => x.d && x.d >= today && x.d <= until)
        .sort((a, b) => `${a.d}${a.t ?? ""}`.localeCompare(`${b.d}${b.t ?? ""}`));
      return {
        period: `${today} a ${until}`,
        kpis: [{ key: "proximos", label: "Próximos 7 dias", value: upcoming.length, unit: "count" }],
        highlights: upcoming.slice(0, 10).map((x) => `${x.d}${x.t ? ` ${x.t}` : ""} — ${x.a}`),
        alerts: [],
      };
    }
    case "indicadores": {
      const cNome = col("indicador");
      const cValor = findColumn(table.headers, ["valor atual", "realizado", "atual", "valor", "resultado"]);
      const cMeta = col("meta");
      if (!cNome || !cValor) return missing("indicador e valor");
      const kpis: Kpi[] = [];
      const alerts: string[] = [];
      for (const r of rows.slice(0, 20)) {
        const v = parseNumber(r[cValor]);
        const m = cMeta ? parseNumber(r[cMeta]) : null;
        const name = r[cNome]!;
        if (!name) continue;
        const ratio = v !== null && m ? Math.round((v / m) * 1000) / 10 : null;
        kpis.push({ key: name, label: name, value: v, unit: "count", ...(ratio !== null ? { text: `${ratio}% da meta (${m})` } : {}) });
        if (ratio !== null && ratio < 80) alerts.push(`${name}: ${ratio}% da meta`);
      }
      return { period: "valores atuais da planilha", kpis, highlights: [], alerts };
    }
    case "tabela":
      return {
        period: null,
        kpis: [{ key: "linhas", label: "Linhas", value: rows.length, unit: "count" }],
        highlights: [`Colunas: ${table.headers.slice(0, 10).join(", ")}`],
        alerts: [],
      };
  }
}

function missing(what: string): MetricsCore {
  return { period: null, kpis: [], highlights: [], alerts: [`Não encontrei a coluna de ${what} no cabeçalho da planilha.`] };
}

// ---------------------------------------------------------------------------
// Sir Alfred Team Hub
// ---------------------------------------------------------------------------
export interface HubPerformanceRow {
  period_label: string;
  professional_name: string;
  services_count: number;
  comandas_count: number;
  revenue_cents: number;
  top_service: string | null;
  created_at: string;
}
export interface HubProductRow {
  period_label: string;
  professional_name: string;
  quantity: number;
  revenue_cents: number;
  top_product: string | null;
  created_at: string;
}
export interface HubReviewRow {
  professional_name: string;
  stars: number;
  comment: string | null;
  review_date: string;
}

/** Períodos em ordem do mais recente (pela data de lançamento mais nova de cada período). */
export function orderedPeriods(rows: { period_label: string; created_at: string }[]): string[] {
  const latest = new Map<string, string>();
  for (const r of rows) if ((latest.get(r.period_label) ?? "") < r.created_at) latest.set(r.period_label, r.created_at);
  return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([p]) => p);
}

export function hubMetrics(perf: HubPerformanceRow[], products: HubProductRow[], reviews: HubReviewRow[], today: string): MetricsCore {
  const periods = orderedPeriods(perf);
  const [current, previous] = periods;
  const kpis: Kpi[] = [];
  const highlights: string[] = [];
  const alerts: string[] = [];

  if (current) {
    const cur = perf.filter((r) => r.period_label === current);
    const prev = previous ? perf.filter((r) => r.period_label === previous) : [];
    const sum = (rows: HubPerformanceRow[], k: "revenue_cents" | "services_count" | "comandas_count") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
    const revenue = sum(cur, "revenue_cents") / 100;
    const prevRevenue = sum(prev, "revenue_cents") / 100;
    const comandas = sum(cur, "comandas_count");
    kpis.push(
      { key: "faturamento", label: "Faturamento", value: round2(revenue), unit: "brl", changePct: previous ? pct(revenue, prevRevenue) : null },
      { key: "servicos", label: "Serviços", value: sum(cur, "services_count"), unit: "count", changePct: previous ? pct(sum(cur, "services_count"), sum(prev, "services_count")) : null },
      { key: "comandas", label: "Comandas", value: comandas, unit: "count" },
      { key: "ticket", label: "Ticket médio", value: comandas ? round2(revenue / comandas) : null, unit: "brl" },
    );
    const ranking = [...cur].sort((a, b) => b.revenue_cents - a.revenue_cents);
    if (ranking[0]) kpis.push({ key: "top_profissional", label: "Destaque", value: null, unit: "text", text: ranking[0].professional_name });
    highlights.push(...ranking.slice(0, 3).map((r, i) => `${i + 1}º ${r.professional_name}: ${brl(r.revenue_cents / 100)} (${r.services_count} serviços)`));
    if (previous) {
      for (const r of cur) {
        const before = prev.find((p) => p.professional_name === r.professional_name);
        const change = before ? pct(r.revenue_cents, before.revenue_cents) : null;
        if (change !== null && change <= -20) alerts.push(`${r.professional_name}: faturamento ${change}% vs ${previous}`);
      }
    }

    const prodCur = products.filter((p) => p.period_label === current);
    if (prodCur.length) {
      const prodRevenue = prodCur.reduce((s, p) => s + p.revenue_cents, 0) / 100;
      kpis.push({ key: "produtos", label: "Venda de produtos", value: round2(prodRevenue), unit: "brl" });
      const best = [...prodCur].sort((a, b) => b.revenue_cents - a.revenue_cents)[0]!;
      highlights.push(`Produtos: ${brl(prodRevenue)}; destaque ${best.professional_name}${best.top_product ? ` (${best.top_product})` : ""}`);
    }
  }

  const since = addDays(today, -29);
  const recent = reviews.filter((r) => r.review_date >= since && r.review_date <= today);
  if (recent.length) {
    const avg = recent.reduce((s, r) => s + r.stars, 0) / recent.length;
    kpis.push({ key: "avaliacao", label: "Avaliação (30 dias)", value: Math.round(avg * 10) / 10, unit: "stars", text: `${recent.length} avaliações` });
    alerts.push(
      ...recent
        .filter((r) => r.stars <= 3)
        .slice(0, 5)
        .map((r) => `★${r.stars} para ${r.professional_name} em ${r.review_date}${r.comment ? `: "${r.comment.slice(0, 120)}"` : ""}`),
    );
  }

  return { period: current ?? null, kpis, highlights, alerts };
}
