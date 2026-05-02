import { useState } from "react";
import { Logo } from "../Logo";
import { LogOut } from "lucide-react";
import Dashboard from "./tabs/Dashboard";
import Team from "./tabs/Team";
import CheckIn from "./tabs/CheckIn";
import Goals from "./tabs/Goals";
import Pulse from "./tabs/Pulse";
import Announcements from "./tabs/Announcements";
import Feedbacks from "./tabs/Feedbacks";
import Ranking from "./tabs/Ranking";
import Awards from "./tabs/Awards";
import Reviews from "./tabs/Reviews";
import Library from "./tabs/Library";
import History from "./tabs/History";
import Pops from "./tabs/Pops";

const TABS = [
  { id: "painel", label: "Painel", C: Dashboard },
  { id: "equipe", label: "Equipe", C: Team },
  { id: "checkin", label: "Check-in", C: CheckIn },
  { id: "metas", label: "Metas", C: Goals },
  { id: "pulso", label: "Pulso", C: Pulse },
  { id: "avisos", label: "Avisos", C: Announcements },
  { id: "feedbacks", label: "Feedbacks", C: Feedbacks },
  { id: "ranking", label: "Ranking", C: Ranking },
  { id: "premios", label: "Prêmios", C: Awards },
  { id: "avaliacoes", label: "Avaliações", C: Reviews },
  { id: "biblioteca", label: "Biblioteca", C: Library },
  { id: "historico", label: "Histórico", C: History },
  { id: "pops", label: "POPs", C: Pops },
];

export default function ManagerView({ onLogout }: { onLogout: () => void }) {
  const [active, setActive] = useState("painel");
  const Active = TABS.find((t) => t.id === active)!.C;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Logo size="sm" />
          <button onClick={onLogout} className="text-muted-foreground hover:text-gold transition flex items-center gap-2 text-sm">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
        <nav className="container overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 pb-3 min-w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  active === t.id ? "gradient-gold text-background shadow-gold" : "text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="container py-8 animate-fade-in">
        <Active />
      </main>
    </div>
  );
}
