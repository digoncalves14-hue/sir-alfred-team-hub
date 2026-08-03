import { useEffect, useState } from "react";
import { Card } from "@/components/ui-kit";
import { Trophy, Target, Star, TrendingUp, Megaphone, MessageCircle, Cake, HelpCircle } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useAuth } from "@/hooks/useAuth";
import { usePhotos } from "@/hooks/usePhotos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { MOOD_OPTIONS } from "@/lib/moods";

const moods = MOOD_OPTIONS;

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "SA";

const TYPE_LABEL: Record<string, string> = {
  Positivo: "Positivo",
  Melhoria: "Sugestão",
  Tecnico: "Técnico",
};

type BirthdayProfile = { id: string; nome: string; foto_url: string | null; data_aniversario: string };
type LastFeedback = { type: string; message: string; created_at: string };
type LastAnnouncement = { unit: string; type: string; message: string; created_at: string };
type Perf = { period_label: string; services_count: number; comandas_count: number; revenue_cents: number; top_service: string | null };

const todayBR = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function PHome() {
  const { user } = useAuth();
  const { getPhoto, refresh } = usePhotos();
  const [profileName, setProfileName] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [birthdays, setBirthdays] = useState<BirthdayProfile[]>([]);
  const [lastFeedback, setLastFeedback] = useState<LastFeedback | null>(null);
  const [lastAnnouncement, setLastAnnouncement] = useState<LastAnnouncement | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [savingPulse, setSavingPulse] = useState(false);
  const [perf, setPerf] = useState<Perf | null>(null);
  const [rankPos, setRankPos] = useState<number | null>(null);
  const [teamPulses, setTeamPulses] = useState<{ id: string; nome: string; mood: string }[]>([]);

  const loadTeamPulses = async () => {
    const { data: rows } = await supabase
      .from("pulses")
      .select("user_id, mood")
      .eq("day", todayBR());
    if (!rows || rows.length === 0) {
      setTeamPulses([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", rows.map((r) => r.user_id));
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.nome as string]));
    setTeamPulses(
      rows
        .map((r) => ({ id: r.user_id, nome: nameById.get(r.user_id) ?? "Profissional", mood: r.mood }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    );
  };

  useEffect(() => {
    if (!user) return;
    loadTeamPulses();
    const ch = supabase
      .channel("team-pulses-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "pulses" }, () => loadTeamPulses())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);


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

    supabase
      .from("feedbacks")
      .select("type, message, created_at")
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLastFeedback(data as LastFeedback);
      });

    supabase
      .from("announcements")
      .select("unit, type, message, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLastAnnouncement(data as LastAnnouncement);
      });

    supabase
      .from("profiles")
      .select("id, nome, foto_url, data_aniversario")
      .not("data_aniversario", "is", null)
      .then(({ data }) => {
        const month = new Date().getMonth() + 1;
        const list = (data ?? [])
          .filter((p) => {
            if (!p.data_aniversario) return false;
            const [, m] = p.data_aniversario.split("-").map(Number);
            return m === month;
          })
          .sort(
            (a, b) =>
              Number(a.data_aniversario!.split("-")[2]) -
              Number(b.data_aniversario!.split("-")[2])
          ) as BirthdayProfile[];
        setBirthdays(list);
      });

    supabase
      .from("pulses")
      .select("mood")
      .eq("user_id", user.id)
      .eq("day", todayBR())
      .maybeSingle()
      .then(({ data }) => {
        if (data?.mood) setPulse(data.mood);
      });

    // Desempenho importado do AppBarber (mais recente)
    supabase
      .from("performance_snapshots")
      .select("period_label, professional_name, services_count, comandas_count, revenue_cents, top_service, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const latestPeriod = data[0].period_label;
        const rows = data.filter((r) => r.period_label === latestPeriod);
        supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle().then(({ data: p }) => {
          const myName = normalize(p?.nome ?? "");
          if (!myName) return;
          const sorted = [...rows].sort((a, b) => b.comandas_count - a.comandas_count);
          const mineIdx = sorted.findIndex((r) => normalize(r.professional_name).includes(myName) || myName.includes(normalize(r.professional_name).split(" ")[0]));
          if (mineIdx >= 0) {
            const mine = sorted[mineIdx];
            setPerf({
              period_label: mine.period_label,
              services_count: mine.services_count,
              comandas_count: mine.comandas_count,
              revenue_cents: mine.revenue_cents,
              top_service: mine.top_service,
            });
            setRankPos(mineIdx + 1);
          }
        });
      });
  }, [user]);

  const savePulse = async (m: string) => {
    if (!user) {
      toast.error("Você precisa estar logado para registrar seu pulso.");
      return;
    }
    const prev = pulse;
    setPulse(m);
    setSavingPulse(true);
    const { error } = await supabase
      .from("pulses")
      .upsert({ user_id: user.id, day: todayBR(), mood: m }, { onConflict: "user_id,day" });
    setSavingPulse(false);
    if (error) {
      setPulse(prev);
      console.error("[pulses] save error", error);
      toast.error(`Não foi possível registrar: ${error.message}`);
      return;
    }
    toast.success("Pulso registrado! O gestor já pode ver.");
  };


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
          { icon: Target, label: "Clientes mês", v: perf ? String(perf.comandas_count) : "—" },
          { icon: TrendingUp, label: "Atendimentos", v: perf ? String(perf.services_count) : "—" },
          { icon: Trophy, label: "Ranking", v: rankPos ? `#${rankPos}` : "—" },
          { icon: Star, label: "Faturamento", v: perf ? (perf.revenue_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—" },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <Card key={i} className="text-center">
              <Icon className="h-5 w-5 text-gold mx-auto mb-2" />
              <p className="text-xl font-black text-foreground">{m.v}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{m.label}</p>
            </Card>
          );
        })}
      </div>
      {perf && (
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center -mt-2">
          Período: {perf.period_label}{perf.top_service ? ` · Top: ${perf.top_service}` : ""}
        </p>
      )}

      {birthdays.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3">
            <Cake className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Aniversariantes do mês</span>
          </div>
          <div className="space-y-2">
            {birthdays.map((b) => {
              const [, m, d] = b.data_aniversario.split("-").map(Number);
              return (
                <div key={b.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{b.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {String(d).padStart(2, "0")}/{String(m).padStart(2, "0")}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><Megaphone className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último aviso</span></div>
          {lastAnnouncement ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {lastAnnouncement.type} · {lastAnnouncement.unit} · {new Date(lastAnnouncement.created_at).toLocaleDateString("pt-BR")}
              </p>
              <p className="text-sm whitespace-pre-wrap">{lastAnnouncement.message}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum aviso publicado ainda.</p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-gold mb-3"><MessageCircle className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-widest">Último feedback</span></div>
          {lastFeedback ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gold mb-1">
                {TYPE_LABEL[lastFeedback.type] ?? lastFeedback.type} ·{" "}
                {new Date(lastFeedback.created_at).toLocaleDateString("pt-BR")}
              </p>
              <p className="text-sm whitespace-pre-wrap">{lastFeedback.message}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum feedback recebido ainda.</p>
          )}
        </Card>
      </div>

      <Card className="border-gold/30 bg-gold/5">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-gold shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-gold">Como marcar meu pulso do dia</p>
            <p className="text-xs text-muted-foreground mt-1">
              Toque no emoji que melhor representa como você está hoje (abaixo). Você pode alterar a qualquer momento até o fim do dia.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold mb-3">Como você está hoje?</p>
        <div className="flex justify-between gap-2">
          {moods.map((m) => (
            <button
              key={m.emoji}
              onClick={() => savePulse(m.emoji)}
              disabled={savingPulse}
              className={`p-3 rounded-2xl flex-1 flex flex-col items-center gap-1 transition-all ${pulse === m.emoji ? "bg-gold/20 scale-110 ring-2 ring-gold" : "bg-secondary hover:bg-secondary/80"}`}
            >
              <span className="text-3xl sm:text-4xl leading-none">{m.emoji}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</span>
            </button>
          ))}
        </div>
        {pulse && <p className="text-center text-xs text-success mt-3 animate-fade-in">✓ Pulso registrado hoje</p>}
      </Card>
    </div>
  );
}
