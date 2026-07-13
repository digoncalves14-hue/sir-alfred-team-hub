import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

type Snapshot = {
  period_label: string;
  professional_name: string;
  services_count: number;
  comandas_count: number;
  revenue_cents: number;
  top_service: string | null;
  created_at: string;
};

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("");
  const [rows, setRows] = useState<Snapshot[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("performance_snapshots")
        .select("period_label,professional_name,services_count,comandas_count,revenue_cents,top_service,created_at")
        .order("created_at", { ascending: false });

      const latestPeriod = data?.[0]?.period_label ?? "";
      setPeriod(latestPeriod);
      setRows(
        (data ?? [])
          .filter((row) => row.period_label === latestPeriod)
          .sort((a, b) => b.revenue_cents - a.revenue_cents) as Snapshot[]
      );
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Referências de Desempenho"
        subtitle={period ? `Dados importados da planilha — ${period}` : "Dados importados da planilha"}
      />
      <Card className="border-gold/30">
        <p className="text-xs uppercase tracking-widest text-gold mb-2">Aviso — Lei do Salão Parceiro</p>
        <p className="text-sm text-muted-foreground">
          Os números abaixo são apenas referências de mercado disponibilizadas ao profissional-parceiro
          para autogestão do seu próprio negócio. Não configuram meta obrigatória, imposição de
          resultado, controle de jornada nem qualquer forma de subordinação (Lei 13.352/2016).
        </p>
      </Card>

      {loading && (
        <Card>
          <p className="text-sm text-muted-foreground">Carregando desempenho importado…</p>
        </Card>
      )}

      {!loading && rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground italic">Nenhum dado importado ainda.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Para aparecer aqui, entre em <span className="text-gold">Importar dados</span>, selecione a
            planilha do AppBarber e salve o desempenho do período.
          </p>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((p, index) => (
          <Card key={`${p.period_label}-${p.professional_name}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-gold">#{index + 1} em faturamento</p>
                <p className="font-bold mt-1">{p.professional_name}</p>
                <p className="text-xs text-muted-foreground">{p.period_label}</p>
              </div>
              <p className="text-lg font-black text-gold whitespace-nowrap">{fmtBRL(p.revenue_cents)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-2xl font-semibold text-gold">{p.services_count}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atendimentos</p>
              </div>
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-2xl font-semibold text-gold">{p.comandas_count}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Comandas</p>
              </div>
            </div>

            {p.top_service && (
              <p className="text-xs text-muted-foreground mt-3">
                Serviço mais realizado: <span className="text-foreground">{p.top_service}</span>
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
