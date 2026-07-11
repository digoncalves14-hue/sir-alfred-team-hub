import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signupSchema = loginSchema.extend({
  nome: z.string().trim().min(2, "Informe seu nome").max(100),
  telefone: z.string().trim().max(20).optional(),
  cargo: z.string().trim().max(60).optional(),
  unidade: z.enum(["Birigui", "Aracatuba", "Penapolis"]),
  categoria: z.enum(["barbeiro", "recepcao"]),
  data_aniversario: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de aniversário"),
});

export default function Auth() {
  const initialMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signup") === "1" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    nome: "",
    telefone: "",
    cargo: "",
    unidade: "Birigui" as "Birigui" | "Aracatuba" | "Penapolis",
    categoria: "barbeiro" as "barbeiro" | "recepcao",
    data_aniversario: "",
  });


  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const parsed = loginSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.errors[0].message);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Bem-vindo!");
      } else {
        const parsed = signupSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.errors[0].message);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              nome: parsed.data.nome,
              telefone: parsed.data.telefone,
              cargo: parsed.data.cargo,
              unidade: parsed.data.unidade,
              categoria: parsed.data.categoria,
            },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Entrando...");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-8 animate-fade-in">
        <Logo size="lg" />
        <h1 className="sr-only">Acesso à plataforma Sir Alfred Team Hub</h1>

        <div className="flex bg-card rounded-2xl p-1 border border-border">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${mode === "login" ? "gradient-gold text-background" : "text-muted-foreground"}`}
          >
            Entrar
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${mode === "signup" ? "gradient-gold text-background" : "text-muted-foreground"}`}
          >
            Cadastrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <>
              <Input aria-label="Nome completo" placeholder="Nome completo" value={form.nome} onChange={(v) => update("nome", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Input aria-label="Telefone" placeholder="Telefone" value={form.telefone} onChange={(v) => update("telefone", v)} />
                <Input aria-label="Cargo" placeholder="Cargo (ex: Barbeiro)" value={form.cargo} onChange={(v) => update("cargo", v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select aria-label="Unidade" value={form.unidade} onChange={(v) => update("unidade", v)} options={[
                  { v: "Birigui", l: "Birigui" },
                  { v: "Aracatuba", l: "Araçatuba" },
                  { v: "Penapolis", l: "Penápolis" },
                ]} />
                <Select aria-label="Categoria" value={form.categoria} onChange={(v) => update("categoria", v)} options={[
                  { v: "barbeiro", l: "Barbeiro" },
                  { v: "recepcao", l: "Recepção" },
                ]} />
              </div>
            </>
          )}
          <Input aria-label="Email" type="email" placeholder="Email" value={form.email} onChange={(v) => update("email", v)} />
          <Input aria-label="Senha" type="password" placeholder="Senha" value={form.password} onChange={(v) => update("password", v)} />

          <button
            disabled={loading}
            className="w-full p-4 rounded-2xl gradient-gold text-background font-bold tracking-wide shadow-gold hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground tracking-widest">
          BIRIGUI · ARAÇATUBA · PENÁPOLIS
        </p>
      </div>
    </main>
  );
}

const Input = ({ value, onChange, ...rest }: any) => (
  <input
    {...rest}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-gold focus:outline-none transition"
  />
);

const Select = ({ value, onChange, options, ...rest }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; [k: string]: any }) => (
  <select
    {...rest}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground focus:border-gold focus:outline-none transition"
  >
    {options.map((o) => (
      <option key={o.v} value={o.v}>{o.l}</option>
    ))}
  </select>
);
