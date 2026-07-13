import { Card, SectionTitle } from "@/components/ui-kit";

export default function PGoals() {
  return (
    <div className="space-y-6">
      <SectionTitle title="Meu Desempenho" subtitle="Referências sugeridas pelo gestor" />
      <Card>
        <p className="text-sm text-muted-foreground italic">
          Nenhuma meta cadastrada ainda.
        </p>
      </Card>
    </div>
  );
}
