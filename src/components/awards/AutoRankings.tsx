import { useEffect, useState } from "react";
import { Card } from "@/components/ui-kit";
import { Trophy, Scissors, ShoppingBag, Instagram, Loader2 } from "lucide-react";
import {
  fetchCortesRanking,
  fetchVendasRanking,
  fetchRedesRanking,
  fmtValue,
  type RankRow,
} from "@/lib/awardsRanking";

type RankBlock = { period: string | null; rows: RankRow[] };

const emptyBlock: RankBlock = { period: null, rows: [] };

export default function AutoRankings() {
  const [cortes, setCortes] = useState<RankBlock>(emptyBlock);
  const [vendas, setVendas] = useState<RankBlock>(emptyBlock);
  const [redes, setRedes] = useState<RankBlock>(emptyBlock);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, b, c] = await Promise.all([
        fetchCortesRanking(),
        fetchVendasRanking(),
        fetchRedesRanking(),
      ]);
      setCortes(a);
      setVendas(b);
      setRedes(c);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-gold">
        <Trophy className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-widest">Ranking automático do mês</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RankingCard title="Maior nº de cortes" icon={<Scissors className="h-4 w-4" />} block={cortes} emptyHint="Importe o Excel de profissionais." />
        <RankingCard title="Maior venda de produtos" icon={<ShoppingBag className="h-4 w-4" />} block={vendas} emptyHint="Importe o Excel de produtos." />
        <RankingCard title="Maior postagem em redes" icon={<Instagram className="h-4 w-4" />} block={redes} emptyHint="Registre os posts do mês." />
      </div>
    </div>
  );
}

function RankingCard({
  title,
  icon,
  block,
  emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  block: RankBlock;
  emptyHint: string;
}) {
  const top3 = block.rows.slice(0, 3);
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 mb-2 text-foreground">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
      </div>
      {block.period && <p className="text-[10px] text-muted-foreground mb-2">{block.period}</p>}
      {top3.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ol className="space-y-1.5">
          {top3.map((r, i) => (
            <li key={r.professional_name} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black ${
                  i === 0 ? "bg-gold text-background" : "bg-secondary text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <span className="truncate font-semibold">{r.professional_name}</span>
              </span>
              <span className={`text-xs font-bold ${i === 0 ? "text-gold" : "text-muted-foreground"}`}>
                {fmtValue(r)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
