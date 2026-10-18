"use client";
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { fmtDate, fmtUsd } from "@/lib/format";
import { Alert, Button, Spinner } from "../ui";
import type { Detail, StudioActions } from "./types";

type Content = {
  youtube_titles: string[];
  youtube_description: string;
  instagram_caption: string;
  facebook_caption: string;
  hashtags: string[];
  thumbnail_ideas: string[];
  call_to_action: string;
  opening_ideas: string[];
  closing_ideas: string[];
};

/** Gerador de textos para publicação, baseado no conteúdo real do vídeo editado. */
export function ContentPanel({ data, actions }: { data: Detail; actions: StudioActions }) {
  const [busy, setBusy] = useState(false);
  const c = data.content;
  const running = c && (c.status === "queued" || c.status === "running");
  const d = c?.status === "succeeded" ? (c.data as unknown as Content) : null;

  const generate = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/projects/${data.project.id}/content`, { method: "POST" });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    actions.notify("Copiado.", "success");
  };

  if (!data.capabilities.ai) {
    return (
      <div className="p-4">
        <Alert tone="warn">A geração de títulos, descrições e hashtags usa IA e requer <b>ANTHROPIC_API_KEY</b> configurada no servidor. Sem ela, este recurso fica desativado — nenhum texto é inventado.</Alert>
      </div>
    );
  }
  return (
    <div className="space-y-4 p-4">
      <Button variant="primary" className="w-full" onClick={generate} loading={busy || Boolean(running)}>
        <Sparkles className="h-4 w-4" /> {d ? "Gerar novamente" : "Gerar textos para redes sociais"}
      </Button>
      <p className="text-[11px] text-neutral-500">Baseado na fala que ficou no vídeo, em quadros amostrados e no tom da marca. Revise antes de publicar.</p>
      {running && <p className="flex items-center gap-2 text-sm text-neutral-400"><Spinner /> Escrevendo…</p>}
      {c?.status === "failed" && <Alert tone="error">{c.errorMessage}</Alert>}
      {d && (
        <div className="space-y-3">
          {c?.versionId !== data.currentVersion?.id && <Alert tone="warn">Estes textos foram gerados para uma versão anterior do vídeo.</Alert>}
          <Block title="Títulos para YouTube" items={d.youtube_titles} onCopy={copy} />
          <Block title="Descrição para YouTube" text={d.youtube_description} onCopy={copy} />
          <Block title="Legenda para Instagram" text={d.instagram_caption} onCopy={copy} />
          <Block title="Legenda para Facebook" text={d.facebook_caption} onCopy={copy} />
          <Block title="Hashtags" text={d.hashtags.join(" ")} onCopy={copy} />
          <Block title="Chamada para ação" text={d.call_to_action} onCopy={copy} />
          <Block title="Ideias de thumbnail" items={d.thumbnail_ideas} onCopy={copy} />
          <Block title="Sugestões de abertura" items={d.opening_ideas} onCopy={copy} />
          <Block title="Sugestões de encerramento" items={d.closing_ideas} onCopy={copy} />
          <p className="text-[10px] text-neutral-600">{c?.model} · {c?.costUsd ? fmtUsd(c.costUsd) : ""} · {c ? fmtDate(c.createdAt) : ""}</p>
        </div>
      )}
    </div>
  );
}

function Block({ title, text, items, onCopy }: { title: string; text?: string; items?: string[]; onCopy: (t: string) => void }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
      <p className="label">{title}</p>
      {text !== undefined && (
        <div className="flex gap-2">
          <p className="flex-1 whitespace-pre-wrap text-sm text-neutral-200">{text}</p>
          <button onClick={() => onCopy(text)} className="self-start text-neutral-500 hover:text-gold-400" aria-label="Copiar"><Copy className="h-4 w-4" /></button>
        </div>
      )}
      {items?.map((t, i) => (
        <div key={i} className="flex gap-2 border-t border-ink-800 py-1.5 first:border-0">
          <p className="flex-1 text-sm text-neutral-200">{t}</p>
          <button onClick={() => onCopy(t)} className="self-start text-neutral-500 hover:text-gold-400" aria-label="Copiar"><Copy className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
