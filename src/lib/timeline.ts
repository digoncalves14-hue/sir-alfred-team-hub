import { Trophy, Target, MessageCircle, GraduationCap, Star } from "lucide-react";

export type TimelineEvent = {
  id: string;
  professional_name: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
};

export const EVENT_TYPES = [
  { key: "premio", label: "Prêmio", icon: Trophy, color: "text-gold" },
  { key: "conquista", label: "Conquista", icon: Target, color: "text-success" },
  { key: "feedback", label: "Feedback", icon: MessageCircle, color: "text-blue-400" },
  { key: "treinamento", label: "Treinamento", icon: GraduationCap, color: "text-warning" },
  { key: "avaliacao", label: "Avaliação", icon: Star, color: "text-gold" },
] as const;

export const eventMeta = (type: string) =>
  EVENT_TYPES.find((t) => t.key === type) ?? EVENT_TYPES[1];

export const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
