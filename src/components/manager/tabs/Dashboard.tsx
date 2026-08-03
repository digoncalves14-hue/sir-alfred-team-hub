import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { Users, Star, Trophy, Crown, Cake, Sparkles, ChevronRight } from "lucide-react";

type Birthday = { id: string; nome: string; unidade: string | null; day: number; month: number };
type Update = { who: string; what: string; when: string };
type Star = { name: string; detail: string } | null;

const relative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
};

const Metric = ({ icon: Icon, label, value, accent, onClick }: any) => (
  <Card
    onClick={onClick}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={(e: any) => onClick && (e.key === "Enter" || e.key === " ") && onClick()}
    className={`transition-all ${onClick ? "cursor-pointer hover:border-gold/50 hover:-translate-y-0.5" : ""}`}
  >
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

const PanelHead = ({ icon: Icon, title, onClick }: any) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-2 text-gold mb-4 w-full text-left hover:opacity-80 transition"
  >
    <Icon className="h-5 w-5" />
    <span className="text-xs font-bold tracking-widest uppercase flex-1">{title}</span>
    <ChevronRight className="h-4 w-4" />
  </button>
);

export default function Dashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const go = (tab: string) => onNavigate?.(tab);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [proCount, setProCount] = useState<number | "—">("—");
  const [awardCount, setAwardCount] = useState(0);
  const [star, setStar] = useState<Star>(null);
  const [avg, setAvg] = useState("—");

  useEffect(() => {
    const load = async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [profiles, awards, snaps, anns, ideas, feeds, behav] = await Promise.all([
        supabase.from("profiles").select("id, nome, unidade, data_aniversario"),
        supabase.from("award_catalog_photos" as any).select("item_key, created_at").gte("created_at", monthStart.toISOString()),
        supabase.from("performance_snapshots").select("professional_name, services_count, revenue_cents, period_label, created_at").order("created_at", { ascending: false }),
        supabase.from("announcements").select("message, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("ideas").select("title, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("feedbacks").select("type, created_at").order("created_at", { ascending: false }).limit(3),
        supabase.from("behavioral_profiles").select("perfil, updated_at, professional_id").order("updated_at", { ascending: false }).limit(3),
      ]);

      const profs = profiles.data ?? [];
      setProCount(profs.length);
      setAwardCount((awards.data as any[])?.length ?? 0);

      const month = new Date().getMonth() + 1;
      setBirthdays(
        profs
          .filter((p: any) => p.data_aniversario && Number(p.data_aniversario.split("-")[1]) === month)
          .map((p: any) => {
            const [, m, d] = p.data_aniversario.split("-").map(Number);
            return { id: p.id, nome: p.nome, unidade: p.unidade, day: d, month: m };
          })
          .sort((a, b) => a.day - b.day)
      );

      const rows = snaps.data ?? [];
      if (rows.length) {
        const latest = rows[0].period_label;
        const period = rows.filter((r) => r.period_label === latest);
        const top = [...period].sort((a, b) => (b.revenue_cents ?? 0) - (a.revenue_cents ?? 0))[0];
        if (top) {
          setStar({
            name: top.professional_name,
            detail: `${top.services_count ?? 0} serviços · ${((top.revenue_cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${latest}`,
          });
        }
        const totalServices = period.reduce((s, r) => s + (r.services_count ?? 0), 0);
        const totalComandas = period.length;
        setAvg(totalComandas ? Math.round(totalServices / totalComandas).toString() : "—");
      }

      const nameById = new Map(profs.map((p: any) => [p.id, p.nome]));
      const list: Update[] = [
        ...(anns.data ?? []).map((a: any) => ({ who: "Aviso", what: a.message?.slice(0, 60) ?? "", when: relative(a.created_at) })),
        ...(ideas.data ?? []).map((i: any) => ({ who: "Nova ideia", what: i.title ?? "", when: relative(i.created_at) })),
        ...(feeds.data ?? []).map((f: any) => ({ who: "Feedback", what: f.type ?? "", when: relative(f.created_at) })),
        ...(behav.data ?? []).map((b: any) => ({
          who: nameById.get(b.professional_id) ?? "Profissional",
          what: `atualizou o perfil comportamental${b.perfil ? ` (${b.perfil})` : ""}`,
          when: relative(b.updated_at),
        })),
      ];
      setUpdates(list.slice(0, 8));
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle title="Painel Geral" subtitle="Visão consolidada da rede Sir Alfred — toque em qualquer card para abrir os detalhes" />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Metric icon={Users} label="Profissionais" value={proCount} onClick={() => go("equipe")} />
        <Metric icon={Star} label="Média de serviços" value={avg} onClick={() => go("metas")} />
        <Metric icon={Trophy} label="Premiações do mês" value={awardCount} accent onClick={() => go("premios")} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="relative overflow-hidden border-gold/40">
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-gold/10 rounded-full blur-2xl" />
          <PanelHead icon={Crown} title="Destaque do período" onClick={() => go("ranking")} />
          {star ? (
            <div>
              <p className="text-xl font-black text-foreground">{star.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{star.detail}</p>
            </div>
          ) : (
            <Empty text="Importe os dados de desempenho para ver o destaque." />
          )}
        </Card>

        <Card>
          <PanelHead icon={Cake} title="Aniversários do mês" onClick={() => go("equipe")} />
          {birthdays.length ? (
            <div className="space-y-3">
              {birthdays.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
                  <div>
                    <p className="font-semibold">{b.nome}</p>
                    <p className="text-xs text-muted-foreground">{b.unidade ?? ""}</p>
                  </div>
                  <span className="text-sm text-gold font-bold">
                    {String(b.day).padStart(2, "0")}/{String(b.month).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="Nenhum aniversário neste mês." />
          )}
        </Card>
      </div>

      <Card>
        <PanelHead icon={Sparkles} title="Atualizações Recentes" onClick={() => go("historico")} />
        {updates.length ? (
          <div className="space-y-3">
            {updates.map((u, i) => (
              <div key={i} className="flex items-center justify-between border-l-2 border-gold pl-4 py-1">
                <p className="text-sm"><span className="font-bold text-foreground">{u.who}</span> <span className="text-muted-foreground">{u.what}</span></p>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">{u.when}</span>
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
