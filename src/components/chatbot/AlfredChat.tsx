import { useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { consumeSSEStream } from "@/lib/sseStream";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Como abrir a unidade corretamente?",
  "Dicas para bater minha meta do mês",
  "Como lidar com um cliente insatisfeito?",
];

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot`;

export default function AlfredChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Não foi possível falar com o assistente agora.");
      }

      let assistantText = "";
      await consumeSSEStream(response.body, (delta) => {
        assistantText += delta;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantText };
          return updated;
        });
        scrollToBottom();
      });
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: error instanceof Error ? error.message : "Não foi possível falar com o assistente agora.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar assistente Sir Alfred" : "Abrir assistente Sir Alfred"}
        className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 h-14 w-14 rounded-full gradient-gold shadow-gold flex items-center justify-center text-background hover:scale-105 transition-transform"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-40 md:bottom-24 right-4 md:right-6 z-40 w-[calc(100vw-2rem)] max-w-sm h-[28rem] bg-card border border-border rounded-2xl shadow-card flex flex-col overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-border gradient-gold">
            <p className="font-bold text-background">Sir Alfred</p>
            <p className="text-xs text-background/80">Assistente do Team Hub</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Ao seu dispor. Pergunte sobre POPs, atendimento, metas ou cultura Sir Alfred.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full text-left text-xs px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "gradient-gold text-background" : "bg-secondary text-foreground"
                  }`}
                >
                  {m.content || <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-border p-3 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escreva sua pergunta..."
              disabled={loading}
              className="flex-1 bg-secondary rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Enviar"
              className="h-9 w-9 rounded-full gradient-gold text-background flex items-center justify-center disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
