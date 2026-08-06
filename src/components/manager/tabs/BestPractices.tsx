import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Sparkles, Heart, MessageCircle, Plus, Trash2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Post = {
  id: string;
  author_id: string;
  unit: string;
  category: string;
  title: string;
  content: string;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

const CATEGORIES = ["Atendimento", "Técnica", "Produtos", "Redes Sociais", "Experiência"];
const UNITS = ["Birigui", "Kids"];

const CAT_COLORS: Record<string, string> = {
  Atendimento: "bg-gold/20 text-gold border-gold/40",
  Técnica: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  Produtos: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  "Redes Sociais": "bg-pink-500/20 text-pink-400 border-pink-500/40",
  Experiência: "bg-purple-500/20 text-purple-400 border-purple-500/40",
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "há 1 dia";
  return `há ${Math.floor(diff / 86400)} dias`;
};

export default function BestPractices() {
  const { user, role } = useAuth();
  const isManager = role === "gestor";

  const [posts, setPosts] = useState<Post[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [draftComment, setDraftComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [unit, setUnit] = useState(UNITS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [p, l, c, pr] = await Promise.all([
      supabase.from("best_practice_posts").select("*").order("created_at", { ascending: false }),
      supabase.from("best_practice_likes").select("post_id, user_id"),
      supabase.from("best_practice_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("profiles").select("id, nome, unidade"),
    ]);

    setPosts((p.data ?? []) as Post[]);

    const likeMap: Record<string, string[]> = {};
    for (const row of l.data ?? []) {
      (likeMap[row.post_id] ??= []).push(row.user_id);
    }
    setLikes(likeMap);

    const commentMap: Record<string, Comment[]> = {};
    for (const row of (c.data ?? []) as Comment[]) {
      (commentMap[row.post_id] ??= []).push(row);
    }
    setComments(commentMap);

    const nameMap: Record<string, string> = {};
    for (const row of pr.data ?? []) nameMap[row.id] = row.nome;
    setNames(nameMap);

    // pré-seleciona a unidade do próprio usuário
    const me = (pr.data ?? []).find((x) => x.id === user?.id);
    if (me?.unidade && UNITS.includes(me.unidade)) setUnit(me.unidade);

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("mural-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "best_practice_posts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "best_practice_comments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !content.trim()) {
      toast.error("Preencha o título e o conteúdo da dica.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("best_practice_posts").insert({
      author_id: user.id,
      unit,
      category,
      title: title.trim(),
      content: content.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setContent("");
    setShowForm(false);
    toast.success("Dica publicada! A equipe foi avisada.");
    load();
  };

  const toggleLike = async (postId: string) => {
    if (!user) return;
    const liked = (likes[postId] ?? []).includes(user.id);
    setLikes((prev) => ({
      ...prev,
      [postId]: liked
        ? (prev[postId] ?? []).filter((u) => u !== user.id)
        : [...(prev[postId] ?? []), user.id],
    }));
    if (liked) {
      await supabase.from("best_practice_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("best_practice_likes").insert({ post_id: postId, user_id: user.id });
    }
  };

  const sendComment = async (postId: string) => {
    if (!user) return;
    const text = (draftComment[postId] ?? "").trim();
    if (!text) return;
    const { error } = await supabase
      .from("best_practice_comments")
      .insert({ post_id: postId, author_id: user.id, content: text });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraftComment((d) => ({ ...d, [postId]: "" }));
    load();
  };

  const removePost = async (postId: string) => {
    const { error } = await supabase.from("best_practice_posts").delete().eq("id", postId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dica removida.");
    load();
  };

  const removeComment = async (id: string) => {
    await supabase.from("best_practice_comments").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Mural de Boas Práticas"
        subtitle="Compartilhe dicas, ideias e cases inspiradores — participação voluntária"
      />

      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-gold flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-background" />
            </div>
            <div>
              <p className="font-semibold text-sm">Inspire outros parceiros da rede</p>
              <p className="text-xs text-muted-foreground">Cada dica compartilhada faz a rede toda crescer.</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition"
          >
            <Plus className="h-4 w-4" /> Nova dica
          </button>
        </div>

        {showForm && (
          <div className="mt-5 space-y-3 border-t border-border pt-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título da dica"
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Conte sua experiência, técnica ou dica..."
              rows={4}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={saving}
                className="gradient-gold text-background font-bold px-5 py-2.5 rounded-xl hover:scale-105 transition disabled:opacity-50"
              >
                {saving ? "Publicando..." : "Publicar"}
              </button>
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground italic">Carregando o mural...</p>
      ) : posts.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground italic">
            Ainda não há dicas publicadas. Seja o primeiro a compartilhar uma boa prática com a equipe.
          </p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {posts.map((p) => {
            const postLikes = likes[p.id] ?? [];
            const liked = !!user && postLikes.includes(user.id);
            const postComments = comments[p.id] ?? [];
            const canDelete = isManager || p.author_id === user?.id;
            return (
              <Card key={p.id}>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <Badge className={CAT_COLORS[p.category] || "bg-gold/20 text-gold border-gold/40"}>{p.category}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.unit} · {timeAgo(p.created_at)}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => removePost(p.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive transition"
                      aria-label="Excluir dica"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <h3 className="font-bold text-gold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed whitespace-pre-wrap">{p.content}</p>

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    por <span className="text-foreground font-semibold">{names[p.author_id] ?? "Equipe"}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleLike(p.id)}
                      className={`flex items-center gap-1.5 text-xs transition ${
                        liked ? "text-gold" : "text-muted-foreground hover:text-gold"
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${liked ? "fill-gold" : ""}`} /> {postLikes.length}
                    </button>
                    <button
                      onClick={() => setOpenComments((o) => ({ ...o, [p.id]: !o[p.id] }))}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition"
                    >
                      <MessageCircle className="h-4 w-4" /> {postComments.length}
                    </button>
                  </div>
                </div>

                {openComments[p.id] && (
                  <div className="mt-3 border-t border-border pt-3 space-y-3">
                    {postComments.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Nenhum comentário ainda.</p>
                    )}
                    {postComments.map((c) => (
                      <div key={c.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{names[c.author_id] ?? "Equipe"}</span>
                          <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
                          {(isManager || c.author_id === user?.id) && (
                            <button
                              onClick={() => removeComment(c.id)}
                              className="ml-auto text-muted-foreground hover:text-destructive transition"
                              aria-label="Excluir comentário"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <input
                        value={draftComment[p.id] ?? ""}
                        onChange={(e) => setDraftComment((d) => ({ ...d, [p.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendComment(p.id);
                        }}
                        placeholder="Escreva um comentário..."
                        className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-xs"
                      />
                      <button
                        onClick={() => sendComment(p.id)}
                        className="gradient-gold text-background rounded-xl p-2 hover:scale-105 transition"
                        aria-label="Enviar comentário"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
