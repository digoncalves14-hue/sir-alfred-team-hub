import { useEffect, useState } from "react";
import { Card } from "@/components/ui-kit";
import { Trophy, Target, Star, TrendingUp, Megaphone, MessageCircle } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useAuth } from "@/hooks/useAuth";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";

const moods = ["😁", "😊", "😐", "😔", "😤"];

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "SA";

export default function PHome() {
  const { user } = useAuth();
  const { getPhoto, refresh } = usePhotos();
  const [profileName, setProfileName] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [unit, setUnit] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("nome, cargo, unidade")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.nome) setProfileName(data.nome);
        if (data?.cargo) setRole(data.cargo);
        if (data?.unidade) setUnit(data.unidade);
      });
  }, [user]);

  const [pulse, setPulse] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4">
        {user ? (
          <AvatarUpload
            userId={user.id}
            initials={initialsOf(profileName)}
            photoUrl={getPhoto(profileName)}
            size="lg"
            onUploaded={() => refresh()}
          />
        ) : null}
        <div>
          <p className="text-xl font-black">Olá, {profileName || "profissional"} 👋</p>
          <p className="text-sm text-muted-foreground">
            {[unit, role].filter(Boolean).join(" · ") || "Complete seu perfil"}
          </p>
          <p className="text-[10px] text-gold uppercase tracking-widest mt-1">Toque na foto para atualizar</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Target, label: "Clientes mês", v: "—" },
          { icon: Star, label: "Avaliação", v: "—" },
          { icon: TrendingUp, label: "Ranking", v: "—" },
          { icon: Trophy, label: "Premiações", v: 0 },
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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><Megaphone className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último aviso</span></div>
          <p className="text-sm text-muted-foreground italic">Nenhum aviso publicado ainda.</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><MessageCircle className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último feedback</span></div>
          <p className="text-sm text-muted-foreground italic">Nenhum feedback recebido ainda.</p>
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
