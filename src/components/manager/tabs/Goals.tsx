import { Card, SectionTitle, ProgressBar } from "@/components/ui-kit";
import { team } from "@/data/team";

export default function Goals() {
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Referências de Desempenho"
        subtitle="Indicadores voluntários para os profissionais-parceiros — sem obrigatoriedade ou cobrança"
      />
      <Card className="border-gold/30">
        <p className="text-xs uppercase tracking-widest text-gold mb-2">Aviso — Lei do Salão Parceiro</p>
        <p className="text-sm text-muted-foreground">
          Os números abaixo são apenas referências de mercado disponibilizadas ao profissional-parceiro
          para autogestão do seu próprio negócio. Não configuram meta obrigatória, imposição de
          resultado, controle de jornada nem qualquer forma de subordinação (Lei 13.352/2016).
        </p>
      </Card>
      {team.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhuma referência publicada ainda.</p></Card>
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
                {pct >= 100 ? "✅ Referência alcançada" : `${Math.round(pct)}% da referência sugerida`}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
