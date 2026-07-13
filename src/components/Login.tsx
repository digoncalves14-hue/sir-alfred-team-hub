import { Logo } from "./Logo";
import { Crown, User } from "lucide-react";


export default function Login({ onSelect }: { onSelect: (v: "manager" | "professional") => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden bg-background">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md space-y-12 animate-fade-in">
        <div className="space-y-2 text-center">
          <Logo size="lg" />
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent" />

        <div className="space-y-4">
          <button
            onClick={() => onSelect("manager")}
            className="group w-full p-5 rounded-2xl gradient-gold text-background font-bold tracking-wide shadow-gold hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
          >
            <Crown className="h-5 w-5" />
            ENTRAR COMO GESTOR
          </button>
          <button
            onClick={() => onSelect("professional")}
            className="group w-full p-5 rounded-2xl bg-card border-2 border-gold text-gold font-bold tracking-wide hover:bg-gold hover:text-background transition-all flex items-center justify-center gap-3"
          >
            <User className="h-5 w-5" />
            ENTRAR COMO PROFISSIONAL
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground tracking-widest">
          BIRIGUI · ARAÇATUBA
        </p>
      </div>
    </div>
  );
}
