import { useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/ui-kit";
import { Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/deleteWithUndo";

type Announcement = {
  id: string;
  unit: string;
  type: string;
  message: string;
  created_at: string;
  author_id: string;
};

const COLORS: Record<string, string> = {
  Geral: "bg-gold/20 text-gold border-gold/40",
  Urgente: "bg-destructive/20 text-destructive border-destructive/40",
  Evento: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export default function Announcements() {
  const { user } = useAuth();
  const [list, setList] = useState<Announcement[]>([]);
  const [unit, setUnit] = useState("Todas");
  const [type, setType] = useState("Geral");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data ?? []) as Announcement[]);
  };

  useEffect(() => {
    load();
  }, []);

  const send = async () => {
    if (!msg.trim() || !user) return;
    setSending(true);
    const { error } = await supabase
      .from("announcements")
      .insert({ author_id: user.id, unit, type, message: msg.trim() });
    setSending(false);
    if (error) return toast.error(error.message);
    setMsg("");
    toast.success("Comunicado publicado");
    load();
  };

  const remove = async (id: string) => {
    const row = list.find((a) => a.id === id);
    if (!row) return;
    const snapshot = list;
    await deleteWithUndo({
      table: "announcements",
      rows: [row],
      onDeleted: () => setList((prev) => prev.filter((a) => a.id !== id)),
      onRestored: () => setList(snapshot),
      label: "Comunicado excluído",
    });
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Avisos" subtitle="Comunicados oficiais da gestão" />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option>Todas</option><option>Birigui</option><option>Kids</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm">
            <option>Geral</option><option>Urgente</option><option>Evento</option>
          </select>
        </div>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva o comunicado..." rows={3} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
        <button onClick={send} disabled={sending || !msg.trim()} className="mt-3 gradient-gold text-background font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100">
          <Send className="h-4 w-4" /> {sending ? "Enviando..." : "Enviar comunicado"}
        </button>
      </Card>
      {list.length === 0 && (
        <Card><p className="text-sm text-muted-foreground italic">Nenhum aviso publicado ainda.</p></Card>
      )}
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center gap-3 mb-2 flex-wrap justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={COLORS[a.type] ?? COLORS.Geral}>{a.type}</Badge>
                <span className="text-xs text-muted-foreground">{a.unit} · {formatDate(a.created_at)}</span>
              </div>
              <button onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive transition" aria-label="Excluir aviso">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{a.message}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
