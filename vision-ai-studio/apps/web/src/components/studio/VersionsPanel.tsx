"use client";
import { useState } from "react";
import { GitCompare, History, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { fmtDate, fmtDuration } from "@/lib/format";
import { Alert, Badge, Button, cx } from "../ui";
import type { Detail, StudioActions } from "./types";

const SOURCE: Record<string, string> = { initial: "Inicial", ai: "IA", manual: "Manual", restore: "Restaurada" };

/** Histórico de versões imutáveis com desfazer, refazer, restaurar e comparar. */
export function VersionsPanel({ data, actions }: { data: Detail; actions: StudioActions }) {
  const [compare, setCompare] = useState<string[]>([]);
  const [diff, setDiff] = useState<null | { a: { number: number; duration: number }; b: { number: number; duration: number }; changes: string[] }>(null);
  const run = async (path: string) => {
    try {
      await apiFetch(path, { method: "POST" });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "warn");
    }
  };
  const toggle = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const doCompare = async () => {
    const [a, b] = [...compare].sort((x, y) => (data.versions.find((v) => v.id === x)!.number - data.versions.find((v) => v.id === y)!.number));
    try {
      setDiff(await apiFetch(`/api/projects/${data.project.id}/compare?a=${a}&b=${b}`));
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => run(`/api/projects/${data.project.id}/undo`)}><Undo2 className="h-3.5 w-3.5" /> Desfazer</Button>
        <Button size="sm" onClick={() => run(`/api/projects/${data.project.id}/redo`)}><Redo2 className="h-3.5 w-3.5" /> Refazer</Button>
        <Button size="sm" className="ml-auto" disabled={compare.length !== 2} onClick={doCompare}><GitCompare className="h-3.5 w-3.5" /> Comparar</Button>
      </div>
      <p className="text-[11px] text-neutral-500">Selecione duas versões para comparar. Restaurar cria uma nova versão — nada é apagado.</p>
      {diff && (
        <Alert>
          <p className="mb-1 font-medium">Versão {diff.a.number} ({fmtDuration(diff.a.duration)}) → versão {diff.b.number} ({fmtDuration(diff.b.duration)})</p>
          <ul className="list-disc pl-4 text-xs">{diff.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </Alert>
      )}
      <ul className="space-y-1.5">
        {data.versions.map((v) => {
          const current = v.id === data.currentVersion?.id;
          return (
            <li key={v.id} className={cx("flex items-start gap-2 rounded-lg border p-2.5", current ? "border-gold-600 bg-gold-700/10" : "border-ink-700 bg-ink-850")}>
              <input type="checkbox" className="mt-1 accent-[#D4AF37]" checked={compare.includes(v.id)} onChange={() => toggle(v.id)} aria-label={`Selecionar versão ${v.number}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <History className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="font-medium">Versão {v.number}</span>
                  <Badge tone={v.source === "ai" ? "gold" : "neutral"}>{SOURCE[v.source] ?? v.source}</Badge>
                  {current && <span className="text-[10px] text-gold-400">atual</span>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-neutral-400">{v.summary}</p>
                <p className="text-[10px] text-neutral-600">{fmtDate(v.createdAt)}</p>
              </div>
              {!current && <Button size="sm" variant="ghost" onClick={() => run(`/api/projects/${data.project.id}/versions/${v.id}/restore`)} title="Restaurar"><RotateCcw className="h-3.5 w-3.5" /></Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
