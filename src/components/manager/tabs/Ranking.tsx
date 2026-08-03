import { useEffect, useState } from "react";
import { Card, SectionTitle, ProgressBar, Stars } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";
import { normalizeName } from "@/lib/teamNames";
import { Loader2 } from "lucide-react";

type Row = {
  name: string;
  unit: string;
  services: number;
  revenueCents: number;
  rating: number;
};

export default function Ranking() {
  const { getPhoto } = usePhotos();
  const [rows, setRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: last } = await supabase
        .from("performance_snapshots")
        .select("period_label")
        .order("period_label", { ascending: false })
        .limit(1);
      const p = (last?.[0] as any)?.period_label ?? null;
      setPeriod(p);

      const [{ data: snaps }, { data: profiles }, { data: reviews }] = await Promise.all([
        p
          ? supabase
              .from("performance_snapshots")
              .select("professional_name, services_count, revenue_cents")
              .eq("period_label", p)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from("profiles").select("nome, unidade"),
        supabase.from("client_reviews").select("professional_name, stars"),
      ]);

      const unitByName = new Map(
        ((profiles ?? []) as any[]).map((x) => [normalizeName(x.nome), x.unidade ?? "—"])
      );
      const starAgg = new Map<string, { sum: number; n: number }>();
      for (const r of (reviews ?? []) as any[]) {
        const k = normalizeName(r.professional_name);
        const cur = starAgg.get(k) ?? { sum: 0, n: 0 };
        starAgg.set(k, { sum: cur.sum + r.stars, n: cur.n + 1 });
      }

      const list: Row[] = ((snaps ?? []) as any[]).map((s) => {
        const k = normalizeName(s.professional_name);
        const agg = starAgg.get(k);
        return {
          name: s.professional_name,
          unit: unitByName.get(k) ?? "—",
          services: s.services_count ?? 0,
          revenueCents: s.revenue_cents ?? 0,
          rating: agg ? agg.sum / agg.n : 0,
        };
      });
      list.sort((a, b) => b.services - a.services);
      setRows(list);
      setLoading(false);
    })();
  }, []);

  const max = rows.length ? Math.max(...rows.map((r) => r.services), 1) : 1;

  return (
    <div>
      <SectionTitle
        title="Ranking"
        subtitle={period ? `Destaques positivos · ${period}` : "Destaques positivos da rede"}
      />
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhum dado importado ainda. Importe o Excel de profissionais na aba Importar dados.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((p, i) => (
            <Card key={p.name} className="hover:border-gold/40 transition">
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-gold w-8">#{i + 1}</span>
                <Avatar
                  initials={p.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                  photoUrl={getPhoto(p.name)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold truncate">{p.name}</p>
                    {p.rating > 0 && <Stars n={p.rating} />}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {p.unit}
                    {p.revenueCents > 0 &&
                      ` · ${(p.revenueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                  </p>
                  <ProgressBar value={p.services} max={max} />
                </div>
                <p className="text-lg font-bold text-gold whitespace-nowrap">{p.services}</p>
              </div>
            </Card>
          ))}
          <p className="text-[11px] text-muted-foreground italic pt-2">
            Referência de destaque baseada nos dados importados do período. Não constitui meta obrigatória.
          </p>
        </div>
      )}
    </div>
  );
}
