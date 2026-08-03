import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyName } from "@/lib/teamNames";
import { buildTimeline, type TimelineItem } from "@/lib/buildTimeline";
import { eventMeta, fmtDate } from "@/lib/timeline";
import { Loader2 } from "lucide-react";

export default function PHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const nome = await fetchMyName(user.id);
      setItems(await buildTimeline(user.id, nome));
      setLoading(false);
    })();
  }, [user]);

  return (
    <div>
      <SectionTitle title="Sua trajetória" subtitle="Linha do tempo de evolução" />
      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">Nenhum evento registrado ainda.</p>
        </Card>
      ) : (
        <div className="relative pl-8">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
          {items.map((h) => {
            const meta = eventMeta(h.event_type);
            const Icon = meta.icon;
            return (
              <div key={h.id} className="relative mb-6 animate-fade-in">
                <div
                  className={`absolute -left-8 top-1 h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center ${meta.color}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <Card>
                  <p className="font-semibold">{h.title}</p>
                  {h.description && <p className="text-sm text-muted-foreground mt-1">{h.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(h.event_date)} · {meta.label}
                  </p>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
