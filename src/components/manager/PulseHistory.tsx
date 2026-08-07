import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { MOOD_OPTIONS, moodLabels } from "@/lib/moods";

const MOOD_SCORE: Record<string, number> = {
  "😁": 5,
  "😊": 4,
  "😐": 3,
  "😔": 2,
  "😤": 1,
};

type DayStat = {
  day: string;
  counts: Record<string, number>;
  total: number;
  avg: number;
};

const RANGES = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

function fmtDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}`;
}

export default function PulseHistory() {
  const [range, setRange] = useState(30);
  const [rows, setRows] = useState<{ mood: string; day: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const from = new Date();
      from.setDate(from.getDate() - (range - 1));
      const fromStr = new Date(from.getTime() - from.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      const { data } = await supabase
        .from("pulses")
        .select("mood, day")
        .gte("day", fromStr)
        .order("day", { ascending: false });
      if (!active) return;
      setRows(data ?? []);
      setLoading(false);
    };
    void load();
    const ch = supabase
      .channel("pulses-history")
      .on("postgres_changes", { event: "*", schema: "public", table: "pulses" }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, [range]);

  const stats: DayStat[] = useMemo(() => {
    const map = new Map<string, DayStat>();
    for (const r of rows) {
      const s =
        map.get(r.day) ?? { day: r.day, counts: {}, total: 0, avg: 0 };
      s.counts[r.mood] = (s.counts[r.mood] ?? 0) + 1;
      s.total += 1;
      map.set(r.day, s);
    }
    const list = [...map.values()];
    for (const s of list) {
      let sum = 0;
      for (const [mood, n] of Object.entries(s.counts)) sum += (MOOD_SCORE[mood] ?? 3) * n;
      s.avg = s.total ? sum / s.total : 0;
    }
    return list.sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [rows]);

  const overall = useMemo(() => {
    const total = stats.reduce((a, s) => a + s.total, 0);
    if (!total) return 0;
    const sum = stats.reduce((a, s) => a + s.avg * s.total, 0);
    return sum / total;
  }, [stats]);

  const chart = [...stats].reverse();

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Histórico do Pulso"
        subtitle="Evolução do humor da equipe ao longo do tempo"
      />

      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setRange(r.days)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              range === r.days
                ? "bg-gold text-background"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">Carregando histórico…</p>
        </Card>
      ) : stats.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Nenhum pulso registrado neste período.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between mb-4">
              <p className="text-sm font-bold">Média do período</p>
              <p className="text-sm">
                <span className="text-2xl font-bold text-gold">{overall.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground"> / 5</span>
              </p>
            </div>
            <div className="flex items-end gap-1 h-32 overflow-x-auto pb-1">
              {chart.map((s) => (
                <div key={s.day} className="flex flex-col items-center gap-1 min-w-[22px] flex-1">
                  <div
                    className="w-full rounded-t-md bg-gold/70"
                    style={{ height: `${Math.max(6, (s.avg / 5) * 100)}%` }}
                    title={`${fmtDay(s.day)} · média ${s.avg.toFixed(1)} · ${s.total} registro(s)`}
                  />
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                    {fmtDay(s.day)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-3">
            {stats.map((s) => (
              <Card key={s.day}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold">{fmtDay(s.day)}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.total} registro{s.total > 1 ? "s" : ""} · média{" "}
                    <span className="text-gold font-semibold">{s.avg.toFixed(1)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MOOD_OPTIONS.filter((m) => s.counts[m.emoji]).map((m) => (
                    <span
                      key={m.emoji}
                      className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                    >
                      <span className="text-base leading-none">{m.emoji}</span>
                      <span className="text-muted-foreground">
                        {moodLabels[m.emoji]} · {s.counts[m.emoji]}
                      </span>
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
