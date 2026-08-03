import { useEffect, useState } from "react";
import { Card, SectionTitle, Stars, Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyName, normalizeName } from "@/lib/teamNames";

type Feedback = {
  id: string;
  type: "Positivo" | "Melhoria" | "Tecnico";
  message: string;
  created_at: string;
};

type Review = { id: string; stars: number; comment: string | null; review_date: string };

const TYPE_COLORS: Record<string, string> = {
  Positivo: "bg-success/20 text-success border-success/40",
  Melhoria: "bg-warning/20 text-warning border-warning/40",
  Tecnico: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};
const TYPE_LABEL: Record<string, string> = { Positivo: "Positivo", Melhoria: "Sugestão", Tecnico: "Técnico" };

export default function PNotes() {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("feedbacks")
      .select("id,type,message,created_at")
      .eq("professional_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setFeedbacks((data ?? []) as Feedback[]));

    (async () => {
      const nome = await fetchMyName(user.id);
      const { data } = await supabase
        .from("client_reviews")
        .select("id, stars, comment, review_date, professional_name")
        .order("review_date", { ascending: false });
      setReviews(
        ((data ?? []) as any[])
          .filter((r) => normalizeName(r.professional_name) === normalizeName(nome))
          .map((r) => ({ id: r.id, stars: r.stars, comment: r.comment, review_date: r.review_date }))
      );
    })();
  }, [user]);

  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.stars === star).length,
  }));
  const total = reviews.length;
  const avg = total ? (reviews.reduce((s, r) => s + r.stars, 0) / total).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <SectionTitle title="Suas notas" subtitle="Avaliações dos clientes" />
      <Card className="text-center">
        <p className="text-6xl font-black text-gold">{avg}</p>
        {total > 0 && <div className="text-2xl mt-2"><Stars n={Number(avg)} /></div>}
        <p className="text-xs text-muted-foreground mt-2">{total} avaliações</p>
      </Card>
      <Card>
        <div className="space-y-3">
          {dist.map((d) => {
            const pct = total ? (d.count / total) * 100 : 0;
            return (
              <div key={d.star} className="flex items-center gap-3">
                <span className="text-sm w-6 text-gold">{d.star}★</span>
                <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full gradient-gold rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{d.count}</span>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-gold font-bold">Feedbacks do gestor</p>
        {feedbacks.length === 0 ? (
          <Card><p className="text-sm text-muted-foreground">Nenhum feedback recebido ainda.</p></Card>
        ) : (
          feedbacks.map((f) => (
            <Card key={f.id}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <Badge className={TYPE_COLORS[f.type]}>{TYPE_LABEL[f.type]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(f.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{f.message}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
