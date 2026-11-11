"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Erro "nova versão publicada com a página aberta": os arquivos antigos da tela já não existem no servidor. */
function isStaleBuild(e: Error): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${e.name} ${e.message}`);
}

/** Barreira de erro das telas do app: em vez da tela branca, explica e oferece tentar de novo. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (isStaleBuild(error)) {
      // recarrega uma vez para pegar a versão nova; se voltar a falhar, mostra a mensagem
      try {
        const key = "vision-stale-reload";
        if (sessionStorage.getItem(key) !== location.pathname) {
          sessionStorage.setItem(key, location.pathname);
          setReloading(true);
          location.reload();
          return;
        }
      } catch {
        // sem sessionStorage: segue para a mensagem
      }
    }
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(error.message ?? error).slice(0, 2000),
        stack: error.stack?.slice(0, 8000),
        digest: error.digest,
        url: location.pathname,
        userAgent: navigator.userAgent.slice(0, 400),
      }),
    }).catch(() => {});
  }, [error]);

  if (reloading) return <div className="grid min-h-[60vh] place-items-center text-sm text-neutral-400">Atualizando para a versão mais nova…</div>;
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-gold-500" />
      <h1 className="mt-4 text-lg font-semibold">Algo deu errado nesta tela</h1>
      <p className="mt-2 text-sm text-neutral-400">Seu projeto está salvo. O erro foi registrado para correção. Tente de novo; se continuar, recarregue a página.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-gold-400">Tentar de novo</button>
        <button onClick={() => location.reload()} className="flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm hover:border-ink-500">
          <RefreshCw className="h-4 w-4" /> Recarregar
        </button>
      </div>
    </div>
  );
}
