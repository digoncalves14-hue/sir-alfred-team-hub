import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Check, X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { enablePush, disablePush, currentSubscription, pushSupported, isIOS, isStandalone } from "@/lib/push";
import { toast } from "sonner";

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
};

export default function NotificationBell({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { user } = useAuth();
  const { items, unread, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(!!s));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const togglePush = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast.success("Notificações no celular desativadas");
      } else {
        await enablePush(user.id);
        setPushOn(true);
        toast.success("Notificações no celular ativadas");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const iosBlocked = isIOS() && !isStandalone();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative text-muted-foreground hover:text-gold transition"
        aria-label="Notificações"
        title="Notificações"
      >
        {unread > 0 ? <BellRing className="h-5 w-5 text-gold" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[320px] max-h-[70vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-bold text-sm">Notificações</p>
            <button onClick={() => setOpen(false)} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-border">
            {!pushSupported() ? (
              <p className="text-xs text-muted-foreground">
                Este navegador não suporta avisos na tela do celular. Você continua vendo tudo aqui no sininho.
              </p>
            ) : iosBlocked ? (
              <p className="text-xs text-muted-foreground">
                No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá para
                receber avisos no celular.
              </p>
            ) : (
              <button
                onClick={togglePush}
                disabled={busy}
                className={`w-full text-xs font-bold px-3 py-2 rounded-xl transition disabled:opacity-50 ${
                  pushOn ? "bg-secondary text-foreground" : "gradient-gold text-background"
                }`}
              >
                {busy ? "Aguarde..." : pushOn ? "Desativar avisos no celular" : "Ativar avisos no celular"}
              </button>
            )}
          </div>

          {items.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground italic">Nenhuma notificação por enquanto.</p>
          )}

          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markRead(n.id);
                if (n.tab && onNavigate) {
                  onNavigate(n.tab);
                  setOpen(false);
                }
              }}
              className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition ${
                n.read_at ? "" : "bg-secondary/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm flex-1">{n.title}</p>
                <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.body}</p>
            </button>
          ))}

          {items.length > 0 && (
            <button
              onClick={markAllRead}
              className="w-full px-4 py-3 text-xs text-muted-foreground hover:text-gold flex items-center justify-center gap-2"
            >
              <Check className="h-3.5 w-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
