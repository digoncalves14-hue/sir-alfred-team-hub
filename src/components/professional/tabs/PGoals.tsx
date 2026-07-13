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
};

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default function PGoals() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", auth.user.id)
        .maybeSingle();

      const nome = profile?.nome || "";
      setUserName(nome);

      const { data: snaps } = await supabase
        .from("performance_snapshots")
        .select("period_label,professional_name,services_count,comandas_count,revenue_cents,top_service,created_at")
        .order("created_at", { ascending: false });

      const tokens = norm(nome).split(/\s+/).filter((t) => t.length >= 3);
      const mine = (snaps || []).filter((s) => {
        const n = norm(s.professional_name);
        return tokens.some((t) => n.includes(t));
      });
      setRows(mine);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Meu Desempenho"
        subtitle="Acompanhamento voluntário da sua performance como profissional-parceiro"
      />
      <Card>
        <p className="text-xs uppercase tracking-widest text-gold mb-2">Referências de mercado</p>
        <p className="text-sm text-muted-foreground">
          Este espaço reúne referências de performance para você acompanhar sua evolução como
          profissional-parceiro autônomo. Não há metas obrigatórias, cobrança de resultado, controle
          de jornada ou penalidade por não atingimento — os números aqui servem apenas para
          autogestão e planejamento do seu próprio negócio.
        </p>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhuma referência publicada para o seu nome ainda.
            {userName ? ` (buscando por "${userName}")` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Assim que o gestor importar a planilha de desempenho da AppBarber, seus números aparecem aqui.
          </p>
        </Card>
      ) : (
        rows.map((r, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-widest text-gold">{r.period_label}</p>
              <p className="text-xs text-muted-foreground">{r.professional_name}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold text-gold">{r.services_count}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atendimentos</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gold">{r.comandas_count}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Comandas</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gold">{fmtBRL(r.revenue_cents)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Faturamento</p>
              </div>
            </div>
            {r.top_service && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Serviço mais realizado: <span className="text-foreground">{r.top_service}</span>
              </p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
