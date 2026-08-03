import { useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Sparkles, Heart, MessageCircle, Plus, Image as ImageIcon } from "lucide-react";

type Post = {
  id: number;
  author: string;
  unit: string;
  category: string;
  title: string;
  content: string;
  date: string;
  likes: number;
  liked?: boolean;
};

const SEED: Post[] = [
  {
    id: 1,
    author: "Rafael Souza",
    unit: "Birigui",
    category: "Atendimento",
    title: "Ritual de boas-vindas com café especial",
    content: "Comecei a oferecer um café especial da região logo na chegada do cliente. O tempo de espera virou parte da experiência e as avaliações subiram bastante.",
    date: "há 2 dias",
    likes: 12,
  },
  {
    id: 2,
    author: "Bruno Alves",
    unit: "Kids",
    category: "Técnica",
    title: "Degradê com pente aberto para cabelos crespos",
    content: "Testei uma variação da técnica de degradê usando o pente aberto no início. Ficou muito mais uniforme em cabelos crespos. Compartilho para quem quiser experimentar.",
    date: "há 4 dias",
    likes: 27,
  },
];

const CATEGORIES = ["Atendimento", "Técnica", "Produtos", "Redes Sociais", "Experiência"];

const CAT_COLORS: Record<string, string> = {
  Atendimento: "bg-gold/20 text-gold border-gold/40",
  Técnica: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  Produtos: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  "Redes Sociais": "bg-pink-500/20 text-pink-400 border-pink-500/40",
  Experiência: "bg-purple-500/20 text-purple-400 border-purple-500/40",
};

export default function BestPractices() {
  const [posts, setPosts] = useState<Post[]>(SEED);
  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState("");
  const [unit, setUnit] = useState("Birigui");
  const [category, setCategory] = useState("Atendimento");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const submit = () => {
    if (!title.trim() || !content.trim() || !author.trim()) return;
    setPosts([
      { id: Date.now(), author, unit, category, title, content, date: "agora", likes: 0 },
      ...posts,
    ]);
    setTitle("");
    setContent("");
    setShowForm(false);
  };

  const toggleLike = (id: number) => {
    setPosts(posts.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)));
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
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Seu nome"
                className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm"
              />
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
                <option>Birigui</option><option>Kids</option>
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button className="text-xs text-muted-foreground flex items-center gap-2 hover:text-gold transition">
                <ImageIcon className="h-4 w-4" /> Anexar foto (em breve)
              </button>
              <button
                onClick={submit}
                className="gradient-gold text-background font-bold px-5 py-2.5 rounded-xl hover:scale-105 transition"
              >
                Publicar
              </button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {posts.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Badge className={CAT_COLORS[p.category] || "bg-gold/20 text-gold border-gold/40"}>{p.category}</Badge>
              <span className="text-xs text-muted-foreground">{p.unit} · {p.date}</span>
            </div>
            <h3 className="font-bold text-gold mb-2">{p.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{p.content}</p>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">por <span className="text-foreground font-semibold">{p.author}</span></span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleLike(p.id)}
                  className={`flex items-center gap-1.5 text-xs transition ${p.liked ? "text-gold" : "text-muted-foreground hover:text-gold"}`}
                >
                  <Heart className={`h-4 w-4 ${p.liked ? "fill-gold" : ""}`} /> {p.likes}
                </button>
                <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition">
                  <MessageCircle className="h-4 w-4" /> Comentar
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
