import { Card, SectionTitle } from "@/components/ui-kit";
import { team } from "@/data/team";
import { AlertTriangle } from "lucide-react";

export default function Pulse() {
  const low = team.filter((t) => t.mood === "😔" || t.mood === "😤");
  return (
    <div className="space-y-6">
      <SectionTitle title="Pulso da Equipe" subtitle="Como cada um está se sentindo hoje" />
      {low.length > 0 && (
        <Card className="border-warning/40 bg-warning/10 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <p className="text-sm"><span className="font-bold text-warning">Atenção:</span> {low.map((l) => l.name).join(", ")} marcou humor baixo hoje.</p>
        </Card>
      )}
      {team.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhum pulso registrado ainda.</p></Card>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {team.map((p) => (
          <Card key={p.id} className="text-center">
            <p className="text-5xl mb-2">{p.mood}</p>
            <p className="font-semibold text-sm">{p.name}</p>
            <p className="text-xs text-muted-foreground truncate">{p.unit}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
