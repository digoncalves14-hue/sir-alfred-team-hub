import { useMemo, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { Send, Scissors, Instagram, ShoppingBag, DollarSign, Crown, Camera, X } from "lucide-react";

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

const CATEGORIES = [
  { id: "cortes", label: "Maior nº de cortes", icon: Scissors },
  { id: "redes", label: "Maior postagem em redes", icon: Instagram },
  { id: "vendas", label: "Maior venda de produtos", icon: ShoppingBag },
  { id: "faturamento", label: "Maior faturamento", icon: DollarSign },
  { id: "trimestre", label: "Prêmio do trimestre", icon: Crown },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

type Award = {
  id: number;
  category: CategoryId;
  quarter: string;
  winner: string;
  desc: string;
  active: boolean;
};

const currentQuarter = () => {
  const d = new Date();
  return `${Math.floor(d.getMonth() / 3) + 1}º Tri ${d.getFullYear()}`;
};

const QUARTERS = (() => {
  const y = new Date().getFullYear();
  const list: string[] = [];
  for (const yr of [y - 1, y, y + 1]) for (let q = 1; q <= 4; q++) list.push(`${q}º Tri ${yr}`);
  return list;
})();

export default function Awards() {
  const { getPhoto } = usePhotos();
  const [tab, setTab] = useState<CategoryId>("cortes");
  const [list, setList] = useState<Award[]>([]);
  const [quarter, setQuarter] = useState(currentQuarter());
  const [winner, setWinner] = useState(team[0]?.name ?? "");
  const [desc, setDesc] = useState("");

  const current = CATEGORIES.find((c) => c.id === tab)!;
  const CatIcon = current.icon;
  const filtered = useMemo(() => list.filter((a) => a.category === tab), [list, tab]);

  const send = () => {
    if (!winner.trim()) return;
    setList([
      { id: Date.now(), category: tab, quarter, winner, desc, active: true },
      ...list.map((a) => (a.category === tab ? { ...a, active: false } : a)),
    ]);
    setDesc("");
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Prêmios" subtitle="Premiações trimestrais por categoria" />

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = tab === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                isActive ? "gradient-gold text-background shadow-gold" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex items-center gap-2 text-gold mb-3">
          <CatIcon className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-widest">{current.label}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {QUARTERS.map((q) => <option key={q}>{q}</option>)}
          </select>
          {team.length ? (
            <select value={winner} onChange={(e) => setWinner(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
              {team.map((t) => <option key={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <input value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="Nome do premiado" className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
          )}
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder={tab === "trimestre" ? "Descrição do prêmio do trimestre..." : "Descrição / valor conquistado..."} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
        <button onClick={send} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition">
          <Send className="h-4 w-4" /> Publicar premiação
        </button>
      </Card>

      {filtered.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground italic">Nenhuma premiação nesta categoria ainda.</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <Card key={a.id} className={a.active ? "border-gold/40" : ""}>
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gold/10"><CatIcon className="h-6 w-6 text-gold" /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-xs text-gold font-bold uppercase tracking-wider">{a.quarter}</p>
                    <Badge className={a.active ? "bg-success/20 text-success border-success/40" : "bg-muted text-muted-foreground border-border"}>{a.active ? "Atual" : "Histórico"}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar initials={initialsOf(a.winner)} photoUrl={getPhoto(a.winner)} size="sm" />
                    <p className="font-bold">{a.winner}</p>
                  </div>
                  {a.desc && <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
