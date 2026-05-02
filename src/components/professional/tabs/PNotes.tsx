import { Card, SectionTitle, Stars } from "@/components/ui-kit";
import { reviews } from "@/data/team";

const dist = [
  { star: 5, count: 38 },
  { star: 4, count: 9 },
  { star: 3, count: 2 },
  { star: 2, count: 0 },
  { star: 1, count: 0 },
];

export default function PNotes() {
  const total = dist.reduce((s, d) => s + d.count, 0);
  const avg = (dist.reduce((s, d) => s + d.star * d.count, 0) / total).toFixed(1);
  return (
    <div className="space-y-6">
      <SectionTitle title="Suas notas" subtitle="Avaliações dos clientes" />
      <Card className="text-center">
        <p className="text-6xl font-black text-gold">{avg}</p>
        <div className="text-2xl mt-2"><Stars n={Number(avg)} /></div>
        <p className="text-xs text-muted-foreground mt-2">{total} avaliações</p>
      </Card>
      <Card>
        <div className="space-y-3">
          {dist.map((d) => {
            const pct = (d.count / total) * 100;
            return (
              <div key={d.star} className="flex items-center gap-3">
                <span className="text-sm w-6 text-gold">{d.star}★</span>
                <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full gradient-gold rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{d.count}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-gold font-bold">Comentários recentes</p>
        {reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between mb-2"><Stars n={r.stars} /><span className="text-xs text-muted-foreground">cliente</span></div>
            <p className="text-sm italic text-muted-foreground">"{r.comment}"</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
