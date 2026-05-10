import { useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { awards, team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { Trophy, Send } from "lucide-react";

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

export default function Awards() {
  const { getPhoto } = usePhotos();
  const [list, setList] = useState(awards);
  const [type, setType] = useState("Barbeiro do Mês");
  const [winner, setWinner] = useState(team[0].name);
  const [desc, setDesc] = useState("");
  const send = () => {
    if (!desc.trim()) return;
    setList([{ id: Date.now(), type, winner, desc, active: true }, ...list]);
    setDesc("");
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Prêmios" subtitle="Reconhecimentos e premiações" />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input value={type} onChange={(e) => setType(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm" placeholder="Tipo de premiação" />
          <select value={winner} onChange={(e) => setWinner(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {team.map((t) => <option key={t.id}>{t.name}</option>)}
          </select>
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Descrição..." className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
        <button onClick={send} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition">
          <Send className="h-4 w-4" /> Publicar premiação
        </button>
      </Card>
      <div className="grid sm:grid-cols-2 gap-4">
        {list.map((a) => (
          <Card key={a.id} className={a.active ? "border-gold/40" : ""}>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gold/10"><Trophy className="h-6 w-6 text-gold" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gold font-bold uppercase tracking-wider">{a.type}</p>
                  <Badge className={a.active ? "bg-success/20 text-success border-success/40" : "bg-muted text-muted-foreground border-border"}>{a.active ? "Ativo" : "Histórico"}</Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar initials={initialsOf(a.winner)} photoUrl={getPhoto(a.winner)} size="sm" />
                  <p className="font-bold">{a.winner}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
