import { Card, SectionTitle } from "@/components/ui-kit";
import { library } from "@/data/team";
import { Scissors, Wind, Eye, Baby, Layers, Crown, Smile, Star } from "lucide-react";

const icons: any = { Scissors, Wind, Eye, Baby, Layers, Crown, Smile, Star };

export default function Library() {
  return (
    <div>
      <SectionTitle title="Biblioteca" subtitle="Conteúdos e treinamentos da rede" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {library.map((c) => {
          const Icon = icons[c.icon];
          return (
            <Card key={c.title} className="text-center hover:border-gold/50 hover:scale-[1.03] transition-all cursor-pointer">
              <div className="inline-flex p-4 rounded-2xl bg-gold/10 text-gold mb-3"><Icon className="h-7 w-7" /></div>
              <p className="font-bold">{c.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.count} vídeos</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
