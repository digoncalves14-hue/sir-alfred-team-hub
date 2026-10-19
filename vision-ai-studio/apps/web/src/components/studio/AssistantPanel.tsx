"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, Send, Sparkles, User, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { fmtUsd } from "@/lib/format";
import { Badge, Button, Spinner } from "../ui";
import type { Detail, StudioActions } from "./types";

const SUGGESTIONS = [
  "Deixe profissional: transições, cor, textos e cartela com a logo",
  "Crie um Reels de 30 segundos com gancho forte e chamada para ação",
  "Coloque transições suaves e cor cinematográfica",
  "Faça uma versão de 30 segundos",
  "Remova os silêncios",
  "Deixe o vídeo mais dinâmico",
  "Retire os primeiros 5 segundos",
  "Adicione legendas automáticas",
  "Adicione minha logo no final",
  "Formato vertical para Reels",
  "Remova os momentos em que não acontece nada",
];

/** Chat com a IA: cada mensagem vira um plano de edição estruturado e uma nova versão. */
export function AssistantPanel({ data, actions }: { data: Detail; actions: StudioActions }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ready = Boolean(data.timeline);
  const runningJob = data.jobs.find((j) => j.type === "ai_command" && (j.status === "running" || j.status === "queued"));

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [data.commands.length, runningJob?.stage]);

  const send = async (msg = text) => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/api/projects/${data.project.id}/commands`, { method: "POST", json: { text: msg.trim() } });
      setText("");
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  const versionNumber = (id: string | null) => data.versions.find((v) => v.id === id)?.number;
  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
        <Sparkles className="h-4 w-4 text-gold-500" />
        <span className="text-sm font-medium">Assistente de edição</span>
        <span className="ml-auto">
          {data.capabilities.ai ? <Badge tone="gold">IA · {data.capabilities.aiModel}</Badge> : <Badge tone="warn">Interpretador local</Badge>}
        </span>
      </div>
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!data.commands.length && (
          <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-sm text-neutral-400">
            Descreva a edição em português. Exemplos: “crie uma versão de 30 segundos”, “remova os silêncios”, “adicione legendas”.
            {!data.capabilities.ai && (
              <p className="mt-2 text-xs text-amber-200/80">Sem chave de IA configurada, um interpretador local entende pedidos comuns. Configure ANTHROPIC_API_KEY para pedidos livres e análise visual.</p>
            )}
          </div>
        )}
        {data.commands.map((c) => (
          <div key={c.id} className="space-y-2">
            <div className="flex justify-end gap-2">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gold-500/15 px-3 py-2 text-sm text-neutral-100">{c.text}</div>
              <User className="mt-1 h-4 w-4 shrink-0 text-neutral-500" />
            </div>
            <div className="flex gap-2">
              <Bot className="mt-1 h-4 w-4 shrink-0 text-gold-500" />
              <div className="max-w-[90%] space-y-1.5 rounded-2xl rounded-tl-sm border border-ink-700 bg-ink-850 px-3 py-2 text-sm">
                {(c.status === "queued" || c.status === "running") && (
                  <p className="flex items-center gap-2 text-neutral-400"><Spinner /> {runningJob?.stage ?? "Aguardando processamento…"}</p>
                )}
                {c.status === "failed" && <p className="text-red-300">Não foi possível aplicar: {c.errorMessage}</p>}
                {c.reply && <p className="text-neutral-200">{c.reply}</p>}
                {c.applied.map((a, i) => (
                  <p key={i} className="flex gap-1.5 text-xs text-emerald-300"><Check className="mt-0.5 h-3 w-3 shrink-0" />{a}</p>
                ))}
                {c.warnings.map((w, i) => (
                  <p key={i} className="flex gap-1.5 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>
                ))}
                {c.unsupported.map((u, i) => (
                  <p key={i} className="flex gap-1.5 text-xs text-neutral-400"><XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" /><span><b className="text-neutral-300">Não executado — {u.request}:</b> {u.reason}</span></p>
                ))}
                {c.status === "no_changes" && <p className="text-xs text-neutral-500">Nenhuma alteração foi feita no vídeo.</p>}
                {(c.status === "applied" || c.status === "no_changes") && (
                  <p className="pt-1 text-[10px] text-neutral-500">
                    {c.engine === "anthropic" ? `IA (${c.model ?? "modelo"})` : "Interpretador local (sem IA)"}
                    {c.resultVersionId && versionNumber(c.resultVersionId) ? ` · versão ${versionNumber(c.resultVersionId)}` : ""}
                    {c.costUsd ? ` · custo estimado ${fmtUsd(c.costUsd)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-ink-800 p-3">
        <div className="scroll-thin mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s) => (
            <button key={s} disabled={!ready || sending} onClick={() => void send(s)} className="shrink-0 rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-neutral-400 hover:border-ink-500 hover:text-white disabled:opacity-40">{s}</button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="input max-h-40 min-h-[44px] flex-1 resize-none"
            rows={2}
            value={text}
            disabled={!ready}
            placeholder={ready ? "Ex.: aproxime a câmera no acabamento e coloque uma música elegante" : "Aguardando o processamento dos vídeos…"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button variant="primary" onClick={() => void send()} loading={sending} disabled={!ready || !text.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
