import { useState } from "react";
import { Card, SectionTitle, ProgressBar, Stars } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";

export default function Ranking() {
  const { getPhoto } = usePhotos();
  const [tab, setTab] = useState<"barber" | "support">("barber");
  const list = team.filter((t) => t.category === tab).sort((a, b) => a.rank - b.rank);
  return (
    <div>
      <SectionTitle title="Ranking" subtitle="Performance dos profissionais" />
      <div className="flex gap-2 mb-6">
        {(["barber", "support"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`px-5 py-2 rounded-full text-sm font-semibold transition ${tab === k ? "gradient-gold text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {k === "barber" ? "Barbeiros" : "Suporte & Gestão"}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {list.map((p) => (
          <Card key={p.id} className="hover:border-gold/40 transition">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-black text-gold w-8">#{p.rank}</span>
              <Avatar initials={p.initials} photoUrl={getPhoto(p.name)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold truncate">{p.name}</p>
                  <Stars n={p.rating} />
                </div>
                <p className="text-xs text-muted-foreground mb-2">{p.unit}</p>
                <ProgressBar value={p.clients} max={p.goal} />
              </div>
              <p className="text-lg font-bold text-gold whitespace-nowrap">{p.clients}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
