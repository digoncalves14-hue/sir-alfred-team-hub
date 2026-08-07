import { useEffect, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { moodLabels, MOOD_OPTIONS } from "@/lib/moods";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Row = {
  user_id: string;
  mood: string;
  day: string;
  nome: string | null;
  unidade: string | null;
};

function todayBR() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export default function Pulse() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);


  const load = async () => {
    const today = todayBR();
    const { data: pulses } = await supabase
      .from("pulses")
      .select("user_id, mood, day")
      .eq("day", today);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome, unidade");

    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const merged: Row[] = (pulses ?? []).map((p) => {
      const prof = profMap.get(p.user_id);
      return {
        user_id: p.user_id,
        mood: p.mood,
        day: p.day,
        nome: prof?.nome ?? null,
        unidade: (prof?.unidade as string | null) ?? null,
      };
    });
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("pulses-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pulses" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);


  const low = rows.filter((r) => r.mood === "😔" || r.mood === "😤");

  return (
    <div className="space-y-6">
      <SectionTitle title="Pulso da Equipe" subtitle="Como cada um está se sentindo hoje" />
      {low.length > 0 && (
        <Card className="border-warning/40 bg-warning/10 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <p className="text-sm">
            <span className="font-bold text-warning">Atenção:</span>{" "}
            {low.map((l) => l.nome ?? "Profissional").join(", ")} marcou humor baixo hoje.
          </p>
        </Card>
      )}
      {!loading && rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhum pulso registrado hoje ainda.
          </p>
        </Card>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {rows.map((p) => (
          <Card key={p.user_id} className="text-center">
            <p className="text-5xl mb-1">{p.mood}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gold mb-2">
              {moodLabels[p.mood] ?? ""}
            </p>
            <p className="font-semibold text-sm">{p.nome ?? "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{p.unidade ?? ""}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
