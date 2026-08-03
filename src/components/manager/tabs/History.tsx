import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { usePhotos } from "@/hooks/usePhotos";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { buildTimeline, type TimelineItem } from "@/lib/buildTimeline";
import { EVENT_TYPES, eventMeta, fmtDate } from "@/lib/timeline";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Profile = { id: string; nome: string };

const initialsOf = (n: string) =>
  n.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

export default function History() {
  const { user } = useAuth();
  const { getPhoto } = usePhotos();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pro, setPro] = useState("");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ event_type: "conquista", title: "", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Profile[];
        setProfiles(list);
        setPro((p) => p || list[0]?.nome || "");
        if (!list.length) setLoading(false);
      });
  }, []);

  const proData = useMemo(() => profiles.find((p) => p.nome === pro), [profiles, pro]);

  const load = async () => {
    if (!proData) return;
    setLoading(true);
    setItems(await buildTimeline(proData.id, proData.nome));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proData?.id]);

  const add = async () => {
    if (!form.title.trim()) return toast.error("Informe o título do evento");
    setSaving(true);
    const { error } = await supabase.from("timeline_events").insert({
      professional_name: pro,
      event_type: form.event_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Evento adicionado ao histórico");
    setForm({ event_type: form.event_type, title: "", description: "" });
    load();
  };

  const remove = (item: TimelineItem) =>
    deleteWithUndo({
      table: "timeline_events",
      rows: [{ id: item.id }],
      onDeleted: () => setItems((p) => p.filter((x) => x.id !== item.id)),
      onRestored: () => load(),
      label: "Evento excluído",
    });

  return (
    <div>
      <SectionTitle title="Histórico" subtitle="Trajetória do profissional na rede" />

      {profiles.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">Nenhum profissional cadastrado ainda.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            {pro && <Avatar initials={initialsOf(pro)} photoUrl={getPhoto(pro)} size="lg" />}
            <select
              value={pro}
              onChange={(e) => setPro(e.target.value)}
              className="bg-card border border-border rounded-xl px-4 py-3 text-sm w-full sm:w-72"
            >
              {profiles.map((p) => (
                <option key={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          <Card className="mb-6">
            <p className="text-xs uppercase tracking-widest text-gold font-bold mb-3">Registrar evento</p>
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <select
                value={form.event_type}
                onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                className="bg-background border border-border rounded-xl px-4 py-3 text-sm"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Destaque do trimestre"
                className="bg-background border border-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Detalhes (opcional)"
              className="mt-3 w-full bg-background border border-border rounded-xl px-4 py-3 text-sm"
            />
            <button
              onClick={add}
              disabled={saving}
              className="mt-3 inline-flex items-center gap-2 gradient-gold text-background font-semibold text-sm px-5 py-2.5 rounded-full disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </button>
          </Card>

          {loading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground italic">Nenhum evento no histórico ainda.</p>
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
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{h.title}</p>
                        {h.source === "manual" && (
                          <button onClick={() => remove(h)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
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
        </>
      )}
    </div>
  );
}
