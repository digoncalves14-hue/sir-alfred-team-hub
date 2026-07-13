import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import VoteButton from "@/components/ideas/VoteButton";

type Idea = {
  id: string;
  author_id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  manager_reply: string | null;
  created_at: string;
  votes: number;
};

const CATEGORIES = [
  { v: "atendimento", label: "Atendimento" },
  { v: "produtos", label: "Produtos" },
  { v: "ambiente", label: "Ambiente" },
  { v: "processos", label: "Processos" },
  { v: "marketing", label: "Marketing" },
  { v: "geral", label: "Geral" },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  nova: { label: "Enviada", cls: "bg-gold/20 text-gold" },
  em_analise: { label: "Em análise", cls: "bg-blue-500/20 text-blue-400" },
  implementada: { label: "Implementada", cls: "bg-emerald-500/20 text-emerald-400" },
  arquivada: { label: "Arquivada", cls: "bg-muted text-muted-foreground" },
};

export default function PIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("geral");

  const [uid, setUid] = useState<string | null>(null);
  const [tab, setTab] = useState<"todas" | "minhas">("todas");

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    setUid(userRes.user?.id ?? null);
    const { data } = await supabase
      .from("ideas")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: counts } = await supabase.rpc("get_idea_vote_counts");
    const countMap: Record<string, number> = {};
    (counts || []).forEach((c: any) => {
      countMap[c.idea_id] = Number(c.votes) || 0;
    });
    const enriched: Idea[] = (data || []).map((i: any) => ({ ...i, votes: countMap[i.id] || 0 }));
    enriched.sort((a, b) => b.votes - a.votes || +new Date(b.created_at) - +new Date(a.created_at));
    setIdeas(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      return toast.error("Preencha título e descrição");
    }
    setSending(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setSending(false);
      return toast.error("Faça login novamente");
    }
    const { error } = await supabase.from("ideas").insert({
      author_id: userRes.user.id,
      title: title.trim(),
      description: description.trim(),
      category,
    });
    setSending(false);
    if (error) return toast.error("Erro ao enviar");
    toast.success("Sugestão enviada! Obrigado.");
    setTitle("");
    setDescription("");
    setCategory("geral");
    load();
  };

  const removeIdea = async (id: string) => {
    if (!confirm("Excluir esta sugestão?")) return;
    const row = ideas.find((i) => i.id === id);
    if (!row) return;
    await deleteWithUndo({
      table: "ideas",
      rows: [row],
      onDeleted: () => setIdeas((prev) => prev.filter((i) => i.id !== id)),
      onRestored: (rows) => setIdeas((prev) => [...rows as any, ...prev]),
      label: "Sugestão excluída",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-gold" /> Caixa de Ideias
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Compartilhe sugestões e melhorias com a gestão. Somente os gestores leem.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título da sugestão"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        >
          {CATEGORIES.map((c) => (
            <option key={c.v} value={c.v}>
              {c.label}
            </option>
          ))}
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva sua ideia com detalhes..."
          rows={4}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold resize-none"
        />
        <button
          onClick={submit}
          disabled={sending}
          className="w-full gradient-gold text-background font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar sugestão
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {tab === "todas" ? "Ideias da equipe" : "Minhas sugestões"}
          </h3>
          <div className="flex gap-1 bg-card border border-border rounded-full p-1">
            {(["todas", "minhas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full transition ${
                  tab === t ? "gradient-gold text-background" : "text-muted-foreground"
                }`}
              >
                {t === "todas" ? "Todas" : "Minhas"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Vote nas ideias que você apoia — as mais votadas viram prioridade.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (() => {
          const visible = tab === "todas" ? ideas : ideas.filter((i) => i.author_id === uid);
          if (visible.length === 0) {
            return (
              <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
                {tab === "todas" ? "Nenhuma ideia ainda." : "Você ainda não enviou sugestões."}
              </div>
            );
          }
          return (
            <div className="space-y-3">
              {visible.map((i) => {
                const st = STATUS_LABEL[i.status] || STATUS_LABEL.nova;
                const mine = i.author_id === uid;
                return (
                  <div key={i.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{i.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                          {i.category} · {new Date(i.created_at).toLocaleDateString("pt-BR")}
                          {mine && " · sua ideia"}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{i.description}</p>
                    {i.manager_reply && (
                      <div className="bg-background/50 border border-gold/30 rounded-lg p-2.5 text-xs">
                        <p className="text-[10px] font-bold uppercase text-gold mb-1">Resposta</p>
                        <p className="whitespace-pre-wrap">{i.manager_reply}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <VoteButton ideaId={i.id} compact />
                      {mine && i.status === "nova" && (
                        <button
                          onClick={() => removeIdea(i.id)}
                          className="ml-auto text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
