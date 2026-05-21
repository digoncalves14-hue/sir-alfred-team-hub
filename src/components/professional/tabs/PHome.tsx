import { useEffect, useState } from "react";
import { Card, SectionTitle, Stars } from "@/components/ui-kit";
import { team, announcements, feedbacks } from "@/data/team";
import { Trophy, Target, Star, TrendingUp, Megaphone, MessageCircle } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useAuth } from "@/hooks/useAuth";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";

const me = team.find((t) => t.id === "thiago")!;
const moods = ["😁", "😊", "😐", "😔", "😤"];

export default function PHome() {
  const { user } = useAuth();
  const { getPhoto, refresh } = usePhotos();
  const [profileName, setProfileName] = useState<string>(me.name);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.nome) setProfileName(data.nome);
    });
  }, [user]);

  const [pulse, setPulse] = useState<string | null>(null);
  const pct = Math.round((me.clients / me.goal) * 100);
  const dash = 2 * Math.PI * 54;
  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4">
        {user ? (
          <AvatarUpload userId={user.id} initials={me.initials} photoUrl={getPhoto(profileName)} size="lg" onUploaded={() => refresh()} />
        ) : null}
        <div>
          <p className="text-xl font-black">Olá, {profileName} 👋</p>
          <p className="text-sm text-muted-foreground">{me.unit} · {me.role}</p>
          <p className="text-[10px] text-gold uppercase tracking-widest mt-1">Toque na foto para atualizar</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Target, label: "Clientes mês", v: me.clients },
          { icon: Star, label: "Avaliação", v: me.rating },
          { icon: TrendingUp, label: "Ranking", v: `#${me.rank}` },
          { icon: Trophy, label: "Premiações", v: 3 },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <Card key={i} className="text-center">
              <Icon className="h-5 w-5 text-gold mx-auto mb-2" />
              <p className="text-2xl font-black text-foreground">{m.v}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</p>
            </Card>
          );
        })}
      </div>

      <Card className="text-center">
        <p className="text-xs uppercase tracking-widest text-gold font-bold mb-4">Meta sugerida do mês</p>
        <div className="relative inline-flex items-center justify-center">
          <svg className="w-40 h-40 -rotate-90">
            <circle cx="80" cy="80" r="54" stroke="hsl(var(--secondary))" strokeWidth="12" fill="none" />
            <circle cx="80" cy="80" r="54" stroke="hsl(var(--gold))" strokeWidth="12" fill="none"
              strokeDasharray={dash} strokeDashoffset={dash - (dash * Math.min(pct, 100)) / 100} strokeLinecap="round" className="transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-4xl font-black text-gold">{pct}%</p>
            <p className="text-xs text-muted-foreground mt-1">{me.clients}/{me.goal}</p>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><Megaphone className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último aviso</span></div>
          <p className="font-semibold text-sm">{announcements[0].type} · {announcements[0].unit}</p>
          <p className="text-sm text-muted-foreground mt-1">{announcements[0].message}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><MessageCircle className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último feedback</span></div>
          <p className="font-semibold text-sm">{feedbacks[0].type}</p>
          <p className="text-sm text-muted-foreground mt-1">{feedbacks[0].message}</p>
        </Card>
      </div>

      <Card>
        <p className="text-sm font-bold mb-3">Como você está hoje?</p>
        <div className="flex justify-between gap-2">
          {moods.map((m) => (
            <button key={m} onClick={() => setPulse(m)} className={`text-3xl sm:text-4xl p-3 rounded-2xl flex-1 transition-all ${pulse === m ? "bg-gold/20 scale-110 ring-2 ring-gold" : "bg-secondary hover:bg-secondary/80"}`}>{m}</button>
          ))}
        </div>
        {pulse && <p className="text-center text-xs text-success mt-3 animate-fade-in">✓ Pulso registrado</p>}
      </Card>
    </div>
  );
}
