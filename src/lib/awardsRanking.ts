import { supabase } from "@/integrations/supabase/client";

export type RankRow = {
  professional_name: string;
  value: number;
  suffix?: string;
};

const currentPeriod = () => {
  const d = new Date();
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
};

/** Pega o rótulo de período mais recente presente na tabela. */
async function latestPeriod(table: string): Promise<string | null> {
  const { data } = await supabase
    .from(table as any)
    .select("period_label")
    .order("period_label", { ascending: false })
    .limit(1);
  return (data?.[0] as any)?.period_label ?? null;
}

export async function fetchCortesRanking(): Promise<{ period: string | null; rows: RankRow[] }> {
  const period = (await latestPeriod("performance_snapshots")) ?? currentPeriod();
  const { data } = await supabase
    .from("performance_snapshots")
    .select("professional_name, services_count")
    .eq("period_label", period)
    .order("services_count", { ascending: false });
  return {
    period,
    rows: (data ?? []).map((r: any) => ({
      professional_name: r.professional_name,
      value: r.services_count,
      suffix: "cortes",
    })),
  };
}

export async function fetchVendasRanking(): Promise<{ period: string | null; rows: RankRow[] }> {
  const period = (await latestPeriod("product_sales_snapshots")) ?? currentPeriod();
  const { data } = await supabase
    .from("product_sales_snapshots" as any)
    .select("professional_name, revenue_cents, quantity")
    .eq("period_label", period)
    .order("revenue_cents", { ascending: false });
  return {
    period,
    rows: (data ?? []).map((r: any) => ({
      professional_name: r.professional_name,
      value: r.revenue_cents,
      suffix: "BRL",
    })),
  };
}

export async function fetchRedesRanking(): Promise<{ period: string | null; rows: RankRow[] }> {
  const period = (await latestPeriod("social_posts_snapshots")) ?? currentPeriod();
  const { data } = await supabase
    .from("social_posts_snapshots" as any)
    .select("professional_name, posts_count")
    .eq("period_label", period)
    .order("posts_count", { ascending: false });
  return {
    period,
    rows: (data ?? []).map((r: any) => ({
      professional_name: r.professional_name,
      value: r.posts_count,
      suffix: "posts",
    })),
  };
}

export const fmtValue = (row: RankRow) => {
  if (row.suffix === "BRL") return (row.value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${row.value} ${row.suffix ?? ""}`.trim();
};
