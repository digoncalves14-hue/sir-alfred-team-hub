import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Idea = {
  id: string;
  author_id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  manager_reply: string | null;
  created_at: string;
};

type Author = { id: string; nome: string; unidade: string | null };

const STATUS = [
  { v: "nova", label: "Nova", cls: "bg-gold/20 text-gold" },
  { v: "em_analise", label: "Em análise", cls: "bg-blue-500/20 text-blue-400" },
  { v: "implementada", label: "Implementada", cls: "bg-emerald-500/20 text-emerald-400" },
  { v: "arquivada", label: "Arquivada", cls: "bg-muted text-muted-foreground" },
];

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("todas");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ideas")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar sugestões");
      setLoading(false);
      return;
    }
    setIdeas(data || []);
    const ids = Array.from(new Set((data || []).map((i) => i.author_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome, unidade")
        .in("id", ids);
      const map: Record<string, Author> = {};
      (profs || []).forEach((p: any) => (map[p.id] = p));
      setAuthors(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("ideas").update({ status }).eq("id", id);
    if (error) return toast.error("Erro ao atualizar");
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    toast.success("Status atualizado");
  };

  const saveReply = async (id: string) => {
    const reply = replies[id]?.trim();
    if (!reply) return;
    const { error } = await supabase
      .from("ideas")
      .update({ manager_reply: reply })
      .eq("id", id);
    if (error) return toast.error("Erro ao responder");
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, manager_reply: reply } : i)));
    setReplies((r) => ({ ...r, [id]: "" }));
    toast.success("Resposta enviada");
  };

  const removeIdea = async (id: string) => {
    if (!confirm("Excluir esta sugestão?")) return;
    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  };

  const visible = filter === "todas" ? ideas : ideas.filter((i) => i.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-gold" /> Caixa de Ideias
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sugestões e melhorias enviadas pelos parceiros — visíveis apenas para gestores.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ v: "todas", label: "Todas" }, ...STATUS].map((s) => (
          <button
            key={s.v}
            onClick={() => setFilter(s.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              filter === s.v ? "gradient-gold text-background" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
          Nenhuma sugestão {filter !== "todas" ? "neste status" : "ainda"}.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((idea) => {
            const author = authors[idea.author_id];
            const st = STATUS.find((s) => s.v === idea.status) || STATUS[0];
            return (
              <div key={idea.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{idea.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {author?.nome || "Parceiro"} · {author?.unidade || "—"} ·{" "}
                      {new Date(idea.created_at).toLocaleDateString("pt-BR")} ·{" "}
                      <span className="capitalize">{idea.category}</span>
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{idea.description}</p>

                {idea.manager_reply && (
                  <div className="bg-background/50 border border-gold/30 rounded-xl p-3 text-sm">
                    <p className="text-[10px] font-bold uppercase text-gold mb-1">Resposta do gestor</p>
                    <p className="whitespace-pre-wrap">{idea.manager_reply}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {STATUS.map((s) => (
                    <button
                      key={s.v}
                      onClick={() => updateStatus(idea.id, s.v)}
                      disabled={idea.status === s.v}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                        idea.status === s.v
                          ? "border-gold text-gold"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <button
                    onClick={() => removeIdea(idea.id)}
                    className="ml-auto text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-destructive transition flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" /> Excluir
                  </button>
                </div>

                {!idea.manager_reply && (
                  <div className="flex gap-2 pt-1">
                    <input
                      value={replies[idea.id] || ""}
                      onChange={(e) => setReplies((r) => ({ ...r, [idea.id]: e.target.value }))}
                      placeholder="Responder ao parceiro..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
                    />
                    <button
                      onClick={() => saveReply(idea.id)}
                      className="px-4 py-2 rounded-lg gradient-gold text-background text-sm font-semibold"
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
