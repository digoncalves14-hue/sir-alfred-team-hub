import { Card, SectionTitle, ProgressBar } from "@/components/ui-kit";
import { team } from "@/data/team";

export default function Goals() {
  return (
    <div>
      <SectionTitle title="Metas sugeridas" subtitle="Referências de desempenho — não obrigatórias" />
      {team.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhuma meta cadastrada ainda.</p></Card>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {team.map((p) => {
          const pct = (p.clients / p.goal) * 100;
          return (
            <Card key={p.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.unit}</p>
                </div>
                <p className="text-2xl font-black text-gold">
                  {p.clients}<span className="text-muted-foreground text-sm">/{p.goal}</span>
                </p>
              </div>
              <ProgressBar value={p.clients} max={p.goal} color="gold" />
              <p className="text-xs text-muted-foreground mt-2">
                {pct >= 100 ? "✅ Meta sugerida alcançada" : `${Math.round(pct)}% da meta sugerida`}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
