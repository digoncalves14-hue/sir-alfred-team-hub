import { useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { feedbacks, team } from "@/data/team";
import { Send } from "lucide-react";

export default function Feedbacks() {
  const [list, setList] = useState(feedbacks);
  const [pro, setPro] = useState(team[0].name);
  const [type, setType] = useState("Positivo");
  const [msg, setMsg] = useState("");
  const send = () => {
    if (!msg.trim()) return;
    const colors: any = { Positivo: "bg-success/20 text-success border-success/40", Melhoria: "bg-warning/20 text-warning border-warning/40", Técnico: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
    setList([{ id: Date.now(), pro, type, message: msg, color: colors[type] }, ...list]);
    setMsg("");
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Feedbacks" subtitle="Reconheça e oriente sua equipe" />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={pro} onChange={(e) => setPro(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {team.map((t) => <option key={t.id}>{t.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option>Positivo</option><option>Melhoria</option><option>Técnico</option>
          </select>
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Descreva o feedback..." className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
        <button onClick={send} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition">
          <Send className="h-4 w-4" /> Enviar feedback
        </button>
      </Card>
      <div className="space-y-3">
        {list.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <p className="font-bold">{f.pro}</p>
              <Badge className={f.color}>{f.type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{f.message}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
