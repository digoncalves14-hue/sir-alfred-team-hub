import { Card, SectionTitle } from "@/components/ui-kit";
import { personalHistory } from "@/data/team";
import { Trophy, Target, MessageCircle, GraduationCap } from "lucide-react";

const icons: any = { Trophy, Target, MessageCircle, GraduationCap };

export default function PHistory() {
  return (
    <div>
      <SectionTitle title="Sua trajetória" subtitle="Linha do tempo de evolução" />
      {personalHistory.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground italic">Nenhum evento registrado ainda.</p></Card>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
          {personalHistory.map((h, i) => {
            const Icon = icons[h.icon];
            return (
              <div key={i} className="relative mb-6 animate-fade-in">
                <div className={`absolute -left-8 top-1 h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center ${h.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <Card>
                  <p className="font-semibold">{h.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{h.date}</p>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
