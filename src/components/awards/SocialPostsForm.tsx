import { useEffect, useState } from "react";
import { Card } from "@/components/ui-kit";
import { Instagram, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { team } from "@/data/team";
import { deleteWithUndo } from "@/lib/deleteWithUndo";

const currentPeriod = () => {
  const d = new Date();
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
};

type Row = {
  id: string;
  professional_name: string;
  period_label: string;
  posts_count: number;
};

export default function SocialPostsForm() {
  const { user } = useAuth();
  const [period, setPeriod] = useState(currentPeriod());
  const [name, setName] = useState(team[0]?.name ?? "");
  const [count, setCount] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("social_posts_snapshots" as any)
      .select("*")
      .eq("period_label", period)
      .order("posts_count", { ascending: false });
    setRows((data as any) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const save = async () => {
    if (!user || !name.trim() || !count) return;
    setSaving(true);
    const { error } = await supabase
      .from("social_posts_snapshots" as any)
      .upsert(
        {
          professional_name: name.trim(),
          period_label: period,
          posts_count: Number(count),
          created_by: user.id,
        },
        { onConflict: "professional_name,period_label" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Registrado");
    setCount("");
    load();
  };

  const remove = async (row: Row) => {
    await deleteWithUndo({
      table: "social_posts_snapshots",
      rows: [row],
      onDeleted: () => setRows((p) => p.filter((r) => r.id !== row.id)),
      onRestored: (rr) => setRows((p) => [...(rr as any[]), ...p]),
      label: `${row.professional_name} removido`,
    });
  };

  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-gold mb-3">
        <Instagram className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-widest">Posts em redes sociais</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Registre manualmente o total de posts que cada barbeiro fez no mês.
      </p>

      <div className="grid sm:grid-cols-4 gap-2 mb-3">
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="Julho/2026"
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
        >
          {team.map((t) => <option key={t.id}>{t.name}</option>)}
        </select>
        <input
          type="number"
          min={0}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="Nº de posts"
          className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={saving || !count}
          className="gradient-gold text-background font-bold rounded-lg text-sm disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <Plus className="h-4 w-4" /> Salvar
        </button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2 text-sm">
              <span className="font-semibold">{r.professional_name}</span>
              <span className="flex items-center gap-3">
                <span className="text-gold font-bold">{r.posts_count} posts</span>
                <button onClick={() => remove(r)} className="text-muted-foreground hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
