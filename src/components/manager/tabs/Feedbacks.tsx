import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/Avatar";
import { FeedbackPhotos } from "@/components/FeedbackPhotos";
import { Send, ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Profile = { id: string; nome: string; foto_url: string | null };
type Feedback = {
  id: string;
  professional_id: string;
  type: "Positivo" | "Melhoria" | "Tecnico" | "Critica";
  message: string;
  created_at: string;
  photo_paths: string[] | null;
};

const initialsOf = (name: string) =>
  name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

const TYPE_COLORS: Record<string, string> = {
  Positivo: "bg-success/20 text-success border-success/40",
  Melhoria: "bg-warning/20 text-warning border-warning/40",
  Tecnico: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  Critica: "bg-destructive/20 text-destructive border-destructive/40",
};
const TYPE_LABEL: Record<string, string> = {
  Positivo: "Positivo",
  Melhoria: "Sugestão",
  Tecnico: "Técnico",
  Critica: "Crítica construtiva",
};

export default function Feedbacks() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [list, setList] = useState<Feedback[]>([]);
  const [pro, setPro] = useState("");
  const [type, setType] = useState<Feedback["type"]>("Positivo");
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, f, r] = await Promise.all([
        supabase.from("profiles").select("id,nome,foto_url").order("nome"),
        supabase.from("feedbacks").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "gestor"),
      ]);
      if (p.error) toast.error(p.error.message);
      else {
        const gestorIds = new Set((r.data ?? []).map((x: { user_id: string }) => x.user_id));
        const filtered = ((p.data ?? []) as Profile[]).filter((x) => !gestorIds.has(x.id));
        setProfiles(filtered);
        if (filtered[0]) setPro(filtered[0].id);
      }
      if (f.error) toast.error(f.error.message);
      else setList((f.data ?? []) as Feedback[]);
    })();
  }, []);

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const picked = Array.from(fl).filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error("Só é possível anexar imagens.");
        return false;
      }
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} é maior que 8MB.`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
  };

  const send = async () => {
    if (!msg.trim() || !pro || !user) return;
    setSending(true);

    const paths: string[] = [];
    for (const f of files) {
      const path = `${pro}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("feedback-photos").upload(path, f, { contentType: f.type });
      if (error) {
        setSending(false);
        return toast.error(error.message);
      }
      paths.push(path);
    }

    const { data, error } = await supabase
      .from("feedbacks")
      .insert({ professional_id: pro, from_user_id: user.id, type, message: msg.trim(), photo_paths: paths })
      .select()
      .single();
    setSending(false);
    if (error) return toast.error(error.message);
    setList([data as Feedback, ...list]);
    setMsg("");
    setFiles([]);
    toast.success("Feedback enviado");
  };

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.nome ?? "—";
  const photoOf = (id: string) => profiles.find((p) => p.id === id)?.foto_url ?? undefined;

  return (
    <div className="space-y-6">
      <SectionTitle title="Feedbacks" subtitle="Reconheça e oriente os parceiros da unidade (privado para cada profissional)" />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={pro} onChange={(e) => setPro(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            {profiles.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as Feedback["type"])} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option value="Positivo">Positivo</option>
            <option value="Melhoria">Sugestão</option>
            <option value="Tecnico">Técnico</option>
            <option value="Critica">Crítica construtiva</option>
          </select>
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="Descreva o feedback..." className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />

        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="relative">
                <img src={URL.createObjectURL(f)} alt={`Prévia ${f.name}`} className="h-20 w-20 object-cover rounded-xl border border-border" />
                <button
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="absolute -top-2 -right-2 bg-card border border-border rounded-full p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Remover foto"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="cursor-pointer text-sm text-muted-foreground hover:text-gold transition flex items-center gap-2 border border-border rounded-xl px-4 py-2.5">
            <ImagePlus className="h-4 w-4" /> Anexar fotos
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
          <button onClick={send} disabled={sending || !pro} className="gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50">
            <Send className="h-4 w-4" /> {sending ? "Enviando..." : "Enviar feedback"}
          </button>
        </div>
      </Card>
      <div className="space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum feedback enviado ainda.</p>}
        {list.map((f) => (
          <Card key={f.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Avatar initials={initialsOf(nameOf(f.professional_id))} photoUrl={photoOf(f.professional_id)} size="sm" />
              <p className="font-bold">{nameOf(f.professional_id)}</p>
              <Badge className={TYPE_COLORS[f.type]}>{TYPE_LABEL[f.type]}</Badge>
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(f.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{f.message}</p>
            <FeedbackPhotos paths={f.photo_paths ?? []} />
          </Card>
        ))}
      </div>
    </div>
  );
}
