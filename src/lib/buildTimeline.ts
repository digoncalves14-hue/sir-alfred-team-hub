import { supabase } from "@/integrations/supabase/client";
import { normalizeName } from "@/lib/teamNames";

export type TimelineItem = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
  source: "manual" | "auto";
};

const dateOnly = (ts: string) => ts.slice(0, 10);

/**
 * Monta a trajetória do profissional combinando eventos manuais
 * (timeline_events) com eventos gerados automaticamente:
 * feedbacks recebidos, avaliações de clientes e perfil comportamental.
 */
export async function buildTimeline(professionalId: string, professionalName: string): Promise<TimelineItem[]> {
  const [manual, feedbacks, reviews, behavioral] = await Promise.all([
    supabase
      .from("timeline_events")
      .select("id, event_type, title, description, event_date, professional_name"),
    supabase.from("feedbacks").select("id, type, message, created_at").eq("professional_id", professionalId),
    supabase.from("client_reviews").select("id, stars, comment, review_date, professional_name"),
    supabase
      .from("behavioral_profiles")
      .select("id, perfil, data_teste, created_at")
      .eq("professional_id", professionalId),
  ]);

  const target = normalizeName(professionalName);
  const items: TimelineItem[] = [];

  for (const r of (manual.data ?? []) as any[]) {
    if (normalizeName(r.professional_name) !== target) continue;
    items.push({
      id: r.id,
      event_type: r.event_type,
      title: r.title,
      description: r.description,
      event_date: r.event_date,
      source: "manual",
    });
  }

  for (const f of (feedbacks.data ?? []) as any[]) {
    items.push({
      id: `fb-${f.id}`,
      event_type: "feedback",
      title: `Feedback do gestor (${f.type === "Positivo" ? "positivo" : f.type === "Melhoria" ? "sugestão" : "técnico"})`,
      description: f.message,
      event_date: dateOnly(f.created_at),
      source: "auto",
    });
  }

  for (const r of (reviews.data ?? []) as any[]) {
    if (normalizeName(r.professional_name) !== target) continue;
    items.push({
      id: `rv-${r.id}`,
      event_type: "avaliacao",
      title: `Avaliação de cliente — ${r.stars}★`,
      description: r.comment,
      event_date: r.review_date,
      source: "auto",
    });
  }

  for (const b of (behavioral.data ?? []) as any[]) {
    items.push({
      id: `bp-${b.id}`,
      event_type: "conquista",
      title: `Perfil comportamental registrado${b.perfil ? `: ${b.perfil}` : ""}`,
      description: null,
      event_date: b.data_teste ?? dateOnly(b.created_at),
      source: "auto",
    });
  }

  return items.sort((a, b) => (a.event_date < b.event_date ? 1 : -1));
}
