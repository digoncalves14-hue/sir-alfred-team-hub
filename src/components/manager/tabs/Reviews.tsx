import { Card, SectionTitle, Stars } from "@/components/ui-kit";
import { reviews } from "@/data/team";

export default function Reviews() {
  return (
    <div>
      <SectionTitle title="Avaliações" subtitle="Feedback dos clientes" />
      {reviews.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhuma avaliação registrada ainda.</p></Card>
      )}
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold">{r.pro}</p>
              <Stars n={r.stars} />
            </div>
            <p className="text-sm text-muted-foreground italic">"{r.comment}"</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
