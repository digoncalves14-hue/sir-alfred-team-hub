import { Card, SectionTitle } from "@/components/ui-kit";
import { Trophy } from "lucide-react";

const myAwards = [
  { type: "Barbeiro do Mês", desc: "Maior número de clientes em Outubro", date: "Out 2026" },
  { type: "Atendimento 5 Estrelas", desc: "Avaliação perfeita do mês", date: "Ago 2026" },
  { type: "Destaque Visagismo", desc: "Trabalho referência da unidade", date: "Jun 2026" },
];

export default function PAwards() {
  return (
    <div className="space-y-6">
      <SectionTitle title="Suas premiações" />
      <Card className="text-center border-gold/40">
        <Trophy className="h-12 w-12 text-gold mx-auto mb-2" />
        <p className="text-5xl font-black text-gold">{myAwards.length}</p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">Conquistadas</p>
      </Card>
      <div className="space-y-3">
        {myAwards.map((a, i) => (
          <Card key={i}>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gold/10"><Trophy className="h-5 w-5 text-gold" /></div>
              <div className="flex-1">
                <p className="font-bold">{a.type}</p>
                <p className="text-sm text-muted-foreground mt-1">{a.desc}</p>
                <p className="text-xs text-gold mt-2">{a.date}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
