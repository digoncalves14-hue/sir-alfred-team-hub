import { useState } from "react";
import { Logo } from "../Logo";
import { LogOut, Home, Megaphone, Star, Trophy, BookOpen, Clock, Brain, Target, Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import PHome from "./tabs/PHome";
import PAnnouncements from "./tabs/PAnnouncements";
import PNotes from "./tabs/PNotes";
import PAwards from "./tabs/PAwards";
import PLibrary from "./tabs/PLibrary";
import PHistory from "./tabs/PHistory";
import PBehavioral from "./tabs/PBehavioral";
import PGoals from "./tabs/PGoals";
import PIdeas from "./tabs/PIdeas";
import BestPractices from "@/components/manager/tabs/BestPractices";

const TABS = [
  { id: "inicio", label: "Início", icon: Home, C: PHome },
  { id: "avisos", label: "Avisos", icon: Megaphone, C: PAnnouncements },
  { id: "perfil", label: "Perfil", icon: Brain, C: PBehavioral },
  { id: "metas", label: "Desempenho", icon: Target, C: PGoals },
  { id: "mural", label: "Mural", icon: Sparkles, C: BestPractices },
  { id: "ideias", label: "Ideias", icon: Lightbulb, C: PIdeas },
  { id: "notas", label: "Notas", icon: Star, C: PNotes },
  { id: "premios", label: "Prêmios", icon: Trophy, C: PAwards },
  { id: "biblioteca", label: "Biblioteca", icon: BookOpen, C: PLibrary },
  { id: "historico", label: "Histórico", icon: Clock, C: PHistory },
];

export default function ProfessionalView({ onLogout }: { onLogout: () => void }) {
  const [active, setActive] = useState("inicio");
  const Active = TABS.find((t) => t.id === active)!.C;
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Logo size="sm" />
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map((r) => r.update()));
                }
                window.location.reload();
              }}
              className="text-muted-foreground hover:text-gold transition flex items-center gap-2 text-sm"
              aria-label="Atualizar"
              title="Atualizar app"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
            <button onClick={onLogout} className="text-muted-foreground hover:text-gold transition flex items-center gap-2 text-sm">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </header>
      <main className="container py-6 animate-fade-in">
        <h1 className="sr-only">Sir Alfred Team Hub — Portal do profissional</h1>
        <Active />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur border-t border-border">
        <div className="container flex items-center justify-between py-2 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button key={t.id} onClick={() => setActive(t.id)} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[60px] ${isActive ? "text-gold" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
