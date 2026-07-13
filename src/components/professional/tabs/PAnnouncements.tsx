import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Announcement = {
  id: string;
  unit: string;
  type: string;
  message: string;
  created_at: string;
};

const COLORS: Record<string, string> = {
  Geral: "bg-gold/20 text-gold border-gold/40",
  Urgente: "bg-destructive/20 text-destructive border-destructive/40",
  Evento: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR") + " " +
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function PAnnouncements() {
  const [list, setList] = useState<Announcement[]>([]);

  useEffect(() => {
    supabase
      .from("announcements")
      .select("id, unit, type, message, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setList((data ?? []) as Announcement[]);
      });
  }, []);

  return (
    <div>
      <SectionTitle title="Avisos" subtitle="Comunicados da gestão" />
      {list.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhum aviso publicado ainda.</p></Card>
      )}
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Badge className={COLORS[a.type] ?? COLORS.Geral}>{a.type}</Badge>
              <span className="text-xs text-muted-foreground">{a.unit} · {formatDate(a.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{a.message}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
