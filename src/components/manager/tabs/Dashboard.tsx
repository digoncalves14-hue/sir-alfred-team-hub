import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team, updates, birthdays } from "@/data/team";
import { Users, Activity, Star, Trophy, Crown, Cake, Sparkles } from "lucide-react";

const Metric = ({ icon: Icon, label, value, accent }: any) => (
  <Card className="hover:border-gold/50 transition-all">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className={`text-3xl font-black mt-2 ${accent ? "text-gold" : "text-foreground"}`}>{value}</p>
      </div>
      <div className="p-3 rounded-xl bg-gold/10 text-gold"><Icon className="h-5 w-5" /></div>
    </div>
  </Card>
);

export default function Dashboard() {
  const online = team.filter((t) => t.checkIn.status === "present").length;
  const avg = (team.reduce((s, t) => s + t.rating, 0) / team.length).toFixed(1);
  const star = team[0];

  return (
    <div className="space-y-6">
      <SectionTitle title="Painel Geral" subtitle="Visão consolidada da rede Sir Alfred" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric icon={Users} label="Profissionais" value="10" />
        <Metric icon={Activity} label="Online agora" value={online} accent />
        <Metric icon={Star} label="Avaliação média" value={avg} />
        <Metric icon={Trophy} label="Premiações do mês" value="4" accent />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="relative overflow-hidden border-gold/40">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-gold/10 rounded-full blur-2xl" />
          <div className="flex items-center gap-2 text-gold mb-4">
            <Crown className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Destaque da Semana</span>
          </div>
          <div className="flex items-center gap-4">
            <Avatar initials={star.initials} size="xl" />
            <div>
              <p className="text-2xl font-black text-foreground">{star.name}</p>
              <p className="text-sm text-muted-foreground">{star.unit}</p>
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="text-gold font-bold">{star.clients} clientes</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-gold">{"★".repeat(5)} {star.rating}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-gold mb-4">
            <Cake className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Aniversários do mês</span>
          </div>
          <div className="space-y-3">
            {birthdays.map((b) => (
              <div key={b.name} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                <div>
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.unit}</p>
                </div>
                <span className="text-sm text-gold font-bold">em {b.days} dias</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 text-gold mb-4">
          <Sparkles className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Atualizações Recentes</span>
        </div>
        <div className="space-y-3">
          {updates.map((u, i) => (
            <div key={i} className="flex items-center justify-between border-l-2 border-gold pl-4 py-1">
              <p className="text-sm"><span className="font-bold text-foreground">{u.who}</span> <span className="text-muted-foreground">{u.what}</span></p>
              <span className="text-xs text-muted-foreground">{u.when}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
