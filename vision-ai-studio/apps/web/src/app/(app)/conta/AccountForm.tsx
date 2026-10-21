"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { Alert, Button } from "@/components/ui";

/** Troca de senha: a senha atual é opcional porque a pessoa já está conectada neste navegador. */
export function AccountForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ tone: "error", text: "A nova senha precisa ter pelo menos 8 caracteres." });
    if (next !== confirm) return setMsg({ tone: "error", text: "A confirmação não é igual à nova senha." });
    setBusy(true);
    try {
      const r = await apiFetch<{ endedSessions: number }>("/api/auth/password", {
        method: "POST",
        json: { newPassword: next, ...(current ? { currentPassword: current } : {}) },
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({
        tone: "success",
        text: `Senha alterada. Use a nova senha para entrar em outros navegadores${r.endedSessions ? ` (${r.endedSessions} outra(s) sessão(ões) foram encerradas por segurança)` : ""}.`,
      });
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel mt-6 space-y-4 p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-gold-500" />
        <h2 className="font-medium">Trocar senha</h2>
      </div>
      <label className="block text-sm">
        <span className="label">Senha atual (opcional)</span>
        <input type="password" autoComplete="current-password" className="input w-full" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <span className="mt-1 block text-xs text-neutral-500">Não lembra? Deixe em branco: como você já está conectado aqui, pode definir uma nova.</span>
      </label>
      <label className="block text-sm">
        <span className="label">Nova senha</span>
        <input type="password" autoComplete="new-password" className="input w-full" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
      </label>
      <label className="block text-sm">
        <span className="label">Confirme a nova senha</span>
        <input type="password" autoComplete="new-password" className="input w-full" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
      </label>
      {msg && <Alert tone={msg.tone === "success" ? "success" : "error"}>{msg.text}</Alert>}
      <Button type="submit" loading={busy}>Salvar nova senha</Button>
    </form>
  );
}
