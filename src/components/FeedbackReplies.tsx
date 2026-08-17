import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Send, Trash2, MessageSquare } from "lucide-react";

type Reply = { id: string; author_id: string; content: string; created_at: string };

export const QUICK_REPLIES_PROFESSIONAL = [
  "Obrigado pelo retorno! Vou aplicar.",
  "Entendi, vou ajustar isso já no próximo atendimento.",
  "Posso conversar pessoalmente sobre isso?",
  "Não concordo totalmente, gostaria de explicar minha visão.",
];

export const QUICK_REPLIES_MANAGER = [
  "Show! Continue assim 👏",
  "Combinado, qualquer dúvida me chama.",
  "Vamos alinhar isso na próxima reunião.",
  "Obrigado pela resposta, seguimos juntos.",
];

export function FeedbackReplies({
  feedbackId,
  quickReplies,
  names,
}: {
  feedbackId: string;
  quickReplies: string[];
  names?: Record<string, string>;
}) {
  const { user, role } = useAuth();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("feedback_replies")
      .select("id,author_id,content,created_at")
      .eq("feedback_id", feedbackId)
      .order("created_at");
    setReplies((data ?? []) as Reply[]);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`feedback-replies-${feedbackId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback_replies", filter: `feedback_id=eq.${feedbackId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [feedbackId]);

  const send = async (content: string) => {
    if (!content.trim() || !user) return;
    setSending(true);
    const { error } = await supabase
      .from("feedback_replies")
      .insert({ feedback_id: feedbackId, author_id: user.id, content: content.trim() });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("feedback_replies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setReplies((r) => r.filter((x) => x.id !== id));
  };

  return (
    <div className="mt-4 border-t border-border pt-3">
      {replies.length > 0 && (
        <div className="space-y-2 mb-3">
          {replies.map((r) => (
            <div key={r.id} className="bg-secondary/60 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-gold">
                  {r.author_id === user?.id ? "Você" : names?.[r.author_id] ?? "Equipe"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}{" "}
                  {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {(r.author_id === user?.id || role === "gestor") && (
                  <button
                    onClick={() => remove(r.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Apagar resposta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground hover:text-gold transition flex items-center gap-1.5"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Responder
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {quickReplies.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={sending}
                className="text-xs border border-border rounded-full px-3 py-1.5 text-muted-foreground hover:text-gold hover:border-gold/50 transition disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(text)}
              placeholder="Escrever resposta..."
              className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={() => send(text)}
              disabled={sending || !text.trim()}
              className="gradient-gold text-background font-bold px-3 rounded-xl disabled:opacity-50"
              aria-label="Enviar resposta"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
