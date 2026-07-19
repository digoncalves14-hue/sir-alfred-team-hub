import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uri?: string };
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

// Beta namespace on supabase-js — typed wrapper.
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [sessionUser, setSessionUser] = useState<{ email?: string; id: string } | null>(null);
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // login form (inline, keeps URL intact)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    if (!authorizationId) {
      setError("Parâmetro authorization_id ausente.");
      setLoading(false);
      return;
    }
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setSessionUser(null);
      setLoading(false);
      return;
    }
    setSessionUser({ id: sess.session.user.id, email: sess.session.user.email ?? undefined });
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return;
    }
    setDetails(data);
    setLoading(false);
  };

  useEffect(() => {
    void loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizationId]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      await loadDetails();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
    } finally {
      setSigningIn(false);
    }
  }

  async function decide(approve: boolean) {
    setBusy(true);
    const call = approve ? oauth().approveAuthorization : oauth().denyAuthorization;
    const { data, error } = await call(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <Logo size="lg" />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            {error}
          </div>
        ) : !sessionUser ? (
          <form onSubmit={handleSignIn} className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">Entre para autorizar o acesso</h2>
            <p className="text-sm text-muted-foreground">
              Um aplicativo externo está solicitando conexão com sua conta Sir Alfred Equipe. Faça login para continuar.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-gold focus:outline-none"
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-gold focus:outline-none"
              required
            />
            <button
              disabled={signingIn}
              className="w-full p-3 rounded-xl gradient-gold text-background font-bold shadow-gold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              ENTRAR
            </button>
          </form>
        ) : details ? (
          <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-gold" />
              <h2 className="text-lg font-bold">
                Conectar {details.client?.name ?? details.client?.client_name ?? "aplicativo"} à sua conta
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Isso permite que {details.client?.name ?? "o aplicativo"} use este app agindo como você
              ({sessionUser.email}). As permissões do app (RLS) continuam valendo.
            </p>
            {details.client?.redirect_uri && (
              <p className="text-xs text-muted-foreground break-all">
                Redirecionamento: <code>{details.client.redirect_uri}</code>
              </p>
            )}
            {details.scope && (
              <p className="text-xs text-muted-foreground">
                Permissões solicitadas: <code>{details.scope}</code>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={busy}
                onClick={() => decide(false)}
                className="p-3 rounded-xl border border-border font-semibold hover:bg-background transition disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                disabled={busy}
                onClick={() => decide(true)}
                className="p-3 rounded-xl gradient-gold text-background font-bold shadow-gold disabled:opacity-60"
              >
                Aprovar
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-center text-xs text-muted-foreground tracking-widest">SIR ALFRED EQUIPE</p>
      </div>
    </main>
  );
}
