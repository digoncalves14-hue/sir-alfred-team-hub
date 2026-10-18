"use client";
import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Film, Plus, RotateCcw, Square } from "lucide-react";
import { JOB_TYPE_LABEL, type JobType } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { uploadFile } from "@/lib/upload-client";
import { fmtBytes, fmtDate, fmtDuration } from "@/lib/format";
import { Button, Progress, Spinner, StatusBadge } from "../ui";
import type { Detail, StudioActions } from "./types";

const JOB_LABEL: Record<string, string> = { queued: "Na fila", running: "Em andamento", succeeded: "Concluída", failed: "Falhou", canceled: "Cancelada" };

/** Vídeos do projeto, envio de novos arquivos e tarefas de processamento (com cancelar/repetir). */
export function FilesPanel({ data, actions }: { data: Detail; actions: StudioActions }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const sources = data.assets.filter((a) => a.role === "source");

  const add = async (files: FileList | null) => {
    for (const f of [...(files ?? [])]) {
      try {
        await uploadFile(f, { role: "source", projectId: data.project.id, onProgress: (p) => setUploads((u) => ({ ...u, [f.name]: p })) });
      } catch (e) {
        actions.notify(`${f.name}: ${(e as Error).message}`, "error");
      } finally {
        setUploads((u) => Object.fromEntries(Object.entries(u).filter(([k]) => k !== f.name)));
      }
    }
    await actions.refresh();
  };
  const jobAction = async (id: string, action: "cancel" | "retry") => {
    try {
      await apiFetch(`/api/jobs/${id}/${action}`, { method: "POST" });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Vídeos do projeto</p>
          <Button size="sm" onClick={() => input.current?.click()}><Plus className="h-3.5 w-3.5" /> Adicionar vídeo</Button>
          <input ref={input} type="file" accept="video/*,.mkv" multiple hidden onChange={(e) => void add(e.target.files)} />
        </div>
        <ul className="space-y-2">
          {sources.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 p-2">
              {a.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnailUrl} alt="" className="h-10 w-16 rounded object-cover" />
              ) : (
                <span className="grid h-10 w-16 place-items-center rounded bg-ink-800"><Film className="h-4 w-4 text-neutral-600" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="text-[11px] text-neutral-500">
                  {a.durationSec ? fmtDuration(a.durationSec) : "—"}{a.width ? ` · ${a.width}×${a.height}` : ""}{a.fps ? ` · ${Math.round(a.fps)} fps` : ""} · {fmtBytes(a.sizeBytes)}
                  {a.hasAudio === false ? " · sem áudio" : ""}
                </span>
                {a.errorMessage && <span className="block text-[11px] text-red-300">{a.errorMessage}</span>}
              </span>
              {a.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : a.status === "error" ? <AlertCircle className="h-4 w-4 text-red-400" /> : <Spinner />}
            </li>
          ))}
          {Object.entries(uploads).map(([name, p]) => (
            <li key={name} className="rounded-lg border border-ink-700 bg-ink-850 p-2 text-sm">
              <span className="block truncate">{name}</span>
              <Progress value={p} className="mt-1" />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label">Processamento</p>
        <ul className="space-y-1.5">
          {data.jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-ink-700 bg-ink-850 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-neutral-200">{JOB_TYPE_LABEL[j.type as JobType] ?? j.type}</span>
                <StatusBadge status={j.status} label={JOB_LABEL[j.status] ?? j.status} />
              </div>
              {j.status === "running" && (
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={j.progress} />
                  <span className="w-9 text-right tabular-nums text-neutral-400">{Math.round(j.progress * 100)}%</span>
                </div>
              )}
              <p className="mt-1 text-[10px] text-neutral-500">
                {j.stage ? `${j.stage} · ` : ""}{fmtDate(j.createdAt)}{j.attempts > 1 ? ` · tentativa ${j.attempts}/${j.maxAttempts}` : ""}{j.processingMs ? ` · ${(j.processingMs / 1000).toFixed(1)}s` : ""}
              </p>
              {j.errorMessage && j.status !== "succeeded" && <p className="mt-1 text-red-300">{j.errorMessage}</p>}
              <div className="mt-1 flex gap-2">
                {(j.status === "queued" || j.status === "running") && <button onClick={() => jobAction(j.id, "cancel")} className="inline-flex items-center gap-1 text-neutral-400 hover:text-red-300"><Square className="h-3 w-3" /> Cancelar</button>}
                {(j.status === "failed" || j.status === "canceled") && <button onClick={() => jobAction(j.id, "retry")} className="inline-flex items-center gap-1 text-gold-400 hover:underline"><RotateCcw className="h-3 w-3" /> Tentar novamente</button>}
              </div>
            </li>
          ))}
          {!data.jobs.length && <p className="text-sm text-neutral-500">Nenhuma tarefa ainda.</p>}
        </ul>
      </div>
    </div>
  );
}
