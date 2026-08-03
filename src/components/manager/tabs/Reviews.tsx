import { useEffect, useState } from "react";
import { Card, SectionTitle, Stars } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchTeamNames } from "@/lib/teamNames";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Review = {
  id: string;
  professional_name: string;
  stars: number;
  comment: string | null;
  review_date: string;
};

export default function Reviews() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Review[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ professional_name: "", stars: 5, comment: "" });

  const load = async () => {
    const [{ data }, teamNames] = await Promise.all([
      supabase
        .from("client_reviews")
        .select("id, professional_name, stars, comment, review_date")
        .order("review_date", { ascending: false }),
      fetchTeamNames(),
    ]);
    setRows((data ?? []) as Review[]);
    setNames(teamNames);
    setForm((f) => ({ ...f, professional_name: f.professional_name || teamNames[0] || "" }));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!form.professional_name) return toast.error("Escolha o profissional");
    setSaving(true);
    const { error } = await supabase.from("client_reviews").insert({
      professional_name: form.professional_name,
      stars: form.stars,
      comment: form.comment || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Avaliação registrada");
    setForm((f) => ({ ...f, comment: "", stars: 5 }));
    load();
  };

  const remove = (r: Review) =>
    deleteWithUndo({
      table: "client_reviews",
      rows: [r],
      onDeleted: () => setRows((p) => p.filter((x) => x.id !== r.id)),
      onRestored: (restored) => setRows((p) => [...(restored as Review[]), ...p]),
      label: "Avaliação excluída",
    });

  const media = rows.length ? (rows.reduce((s, r) => s + r.stars, 0) / rows.length).toFixed(1) : "—";

  return (
    <div>
      <SectionTitle title="Avaliações" subtitle="Feedback dos clientes registrado pela gestão" />

      <Card className="mb-6">
        <p className="text-xs uppercase tracking-widest text-gold font-bold mb-3">Nova avaliação</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <select
            value={form.professional_name}
            onChange={(e) => setForm({ ...form, professional_name: e.target.value })}
            className="bg-background border border-border rounded-xl px-4 py-3 text-sm"
          >
            {names.length === 0 && <option value="">Nenhum profissional cadastrado</option>}
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select
            value={form.stars}
            onChange={(e) => setForm({ ...form, stars: Number(e.target.value) })}
            className="bg-background border border-border rounded-xl px-4 py-3 text-sm"
          >
            {[5, 4, 3, 2, 1].map((s) => (
              <option key={s} value={s}>
                {"★".repeat(s)} ({s})
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          placeholder="Comentário do cliente (opcional)"
          rows={2}
          className="mt-3 w-full bg-background border border-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          onClick={add}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-2 gradient-gold text-background font-semibold text-sm px-5 py-2.5 rounded-full disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Registrar
        </button>
      </Card>

      {loading ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">Nenhuma avaliação registrada ainda.</p>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            {rows.length} avaliações · média <span className="text-gold font-bold">{media}</span>
          </p>
          <div className="space-y-3">
            {rows.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-bold">{r.professional_name}</p>
                  <div className="flex items-center gap-3">
                    <Stars n={r.stars} />
                    <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {r.comment && <p className="text-sm text-muted-foreground italic">"{r.comment}"</p>}
                <p className="text-[11px] text-muted-foreground mt-2">
                  {new Date(r.review_date + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
