"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Logo } from "./AppShell";
import { Alert, Button } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await apiFetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        json: Object.fromEntries([...f.entries()].filter(([, v]) => String(v).trim() !== "")),
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
            <p className="text-sm text-neutral-400">{mode === "login" ? "Acesse seu estúdio de vídeo com IA." : "Comece a produzir vídeos com IA em minutos."}</p>
          </div>
          {mode === "register" && (
            <>
              <div>
                <label className="label" htmlFor="name">Nome</label>
                <input id="name" name="name" className="input" required minLength={2} autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="organization">Empresa / equipe</label>
                <input id="organization" name="organization" className="input" placeholder="Ex.: Sir Alfred" />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" className="input" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" className="input" required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <p className="text-center text-sm text-neutral-400">
            {mode === "login" ? (
              <>Não tem conta? <Link className="text-gold-400 hover:underline" href="/cadastro">Cadastre-se</Link></>
            ) : (
              <>Já tem conta? <Link className="text-gold-400 hover:underline" href="/entrar">Entrar</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
