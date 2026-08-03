import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    setDone(true);
    toast.success("Senha alterada! Você já está conectado.");
    setTimeout(() => (window.location.href = "/"), 1200);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md space-y-8">
        <Logo size="lg" />
        <h1 className="text-center text-lg font-semibold text-foreground">Criar nova senha</h1>

        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            Abra esta página pelo link enviado no seu email para redefinir a senha.
          </p>
        ) : done ? (
          <p className="text-center text-sm text-muted-foreground">Senha atualizada, redirecionando...</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              aria-label="Nova senha"
              placeholder="Nova senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
            <input
              type="password"
              aria-label="Confirmar nova senha"
              placeholder="Confirmar nova senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none"
            />
            <button
              disabled={loading}
              className="w-full p-4 rounded-2xl gradient-gold text-background font-bold tracking-wide shadow-gold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              SALVAR NOVA SENHA
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
