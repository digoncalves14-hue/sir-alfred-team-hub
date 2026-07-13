import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { team, updates } from "@/data/team";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";
import { Users, Star, Trophy, Crown, Cake, Sparkles } from "lucide-react";

type Birthday = { id: string; nome: string; unidade: string | null; data_aniversario: string; day: number; month: number };

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

const Empty = ({ text }: { text: string }) => (
  <p className="text-sm text-muted-foreground italic">{text}</p>
);

export default function Dashboard() {
  const { getPhoto } = usePhotos();
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const avg = team.length ? (team.reduce((s, t) => s + t.rating, 0) / team.length).toFixed(1) : "—";
  const star = team[0];

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome, unidade, data_aniversario")
      .not("data_aniversario", "is", null)
      .then(({ data }) => {
        const month = new Date().getMonth() + 1;
        const list = (data ?? [])
          .filter((p) => p.data_aniversario && Number(p.data_aniversario.split("-")[1]) === month)
          .map((p) => {
            const [, m, d] = p.data_aniversario!.split("-").map(Number);
            return { id: p.id, nome: p.nome, unidade: p.unidade, data_aniversario: p.data_aniversario!, day: d, month: m };
          })
          .sort((a, b) => a.day - b.day);
        setBirthdays(list);
      });
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle title="Painel Geral" subtitle="Visão consolidada da rede Sir Alfred" />


      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Metric icon={Users} label="Profissionais" value={team.length} />
        <Metric icon={Star} label="Avaliação média" value={avg} />
        <Metric icon={Trophy} label="Premiações do mês" value="0" accent />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="relative overflow-hidden border-gold/40">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-gold/10 rounded-full blur-2xl" />
          <div className="flex items-center gap-2 text-gold mb-4">
            <Crown className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Destaque da Semana</span>
          </div>
          {star ? (
            <div className="flex items-center gap-4">
              <Avatar initials={star.initials} photoUrl={getPhoto(star.name)} size="xl" />
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
          ) : (
            <Empty text="Nenhum destaque cadastrado ainda." />
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-gold mb-4">
            <Cake className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Aniversários do mês</span>
          </div>
          {birthdays.length ? (
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
          ) : (
            <Empty text="Nenhum aniversário cadastrado." />
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 text-gold mb-4">
          <Sparkles className="h-5 w-5" /> <span className="text-xs font-bold tracking-widest uppercase">Atualizações Recentes</span>
        </div>
        {updates.length ? (
          <div className="space-y-3">
            {updates.map((u, i) => (
              <div key={i} className="flex items-center justify-between border-l-2 border-gold pl-4 py-1">
                <p className="text-sm"><span className="font-bold text-foreground">{u.who}</span> <span className="text-muted-foreground">{u.what}</span></p>
                <span className="text-xs text-muted-foreground">{u.when}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Nenhuma atualização registrada." />
        )}
      </Card>
    </div>
  );
}
