import { useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { announcements } from "@/data/team";
import { Send } from "lucide-react";

export default function Announcements() {
  const [list, setList] = useState(announcements);
  const [unit, setUnit] = useState("Todas");
  const [type, setType] = useState("Geral");
  const [msg, setMsg] = useState("");

  const send = () => {
    if (!msg.trim()) return;
    const colors: any = { Geral: "bg-gold/20 text-gold border-gold/40", Urgente: "bg-destructive/20 text-destructive border-destructive/40", Evento: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
    setList([{ id: Date.now(), unit, type, message: msg, date: "agora", color: colors[type] }, ...list]);
    setMsg("");
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Avisos" subtitle="Comunicados oficiais da gestão" />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option>Todas</option><option>Birigui</option><option>Araçatuba</option><option>Kids</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option>Geral</option><option>Urgente</option><option>Evento</option>
          </select>
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva o comunicado..." rows={3} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
        <button onClick={send} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition">
          <Send className="h-4 w-4" /> Enviar comunicado
        </button>
      </Card>
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge className={a.color}>{a.type}</Badge>
              <span className="text-xs text-muted-foreground">{a.unit} · {a.date}</span>
            </div>
            <p className="text-sm">{a.message}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
