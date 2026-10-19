"use client";
import { useEffect, useMemo, useState } from "react";
import { Eraser, RotateCcw, X } from "lucide-react";
import { placeClips, type Timeline } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { fmtTime } from "@/lib/format";
import { Alert, Button, Spinner, cx } from "../ui";
import type { Detail, StudioActions } from "./types";

type Word = { text: string; start: number; end: number };
type AssetTranscript = { assetId: string; words: Word[]; segments: Array<{ start: number; end: number; text: string }> };

/**
 * Edição pela transcrição: palavras riscadas não estão no vídeo. Selecione um
 * trecho (clique na primeira e na última palavra) e remova ou restaure.
 */
export function TranscriptPanel({ data, timeline, actions }: { data: Detail; timeline: Timeline; actions: StudioActions }) {
  const [list, setList] = useState<AssetTranscript[] | null>(null);
  const [sel, setSel] = useState<{ assetId: string; a: number; b: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ assets: AssetTranscript[] }>(`/api/projects/${data.project.id}/transcript`)
      .then((r) => setList(r.assets))
      .catch((e) => actions.notify((e as Error).message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.project.id, data.transcripts.length]);

  const placed = useMemo(() => placeClips(timeline), [timeline]);
  const outTime = (assetId: string, w: Word) => {
    const p = placed.find((x) => x.clip.assetId === assetId && w.start >= x.clip.sourceStart - 0.02 && w.end <= x.clip.sourceEnd + 0.02);
    return p ? p.outStart + Math.max(0, w.start - p.clip.sourceStart) : null;
  };
  const names = new Map(data.assets.map((a) => [a.id, a.name]));

  if (!list) return <div className="flex items-center gap-2 p-4 text-sm text-neutral-400"><Spinner /> Carregando transcrição…</div>;
  if (!list.some((a) => a.words.length || a.segments.length)) {
    return (
      <div className="p-4">
        <Alert tone={data.capabilities.transcription ? "info" : "warn"}>
          {data.capabilities.transcription ? "Gere a transcrição na aba Legendas para editar o vídeo pelo texto." : "A transcrição automática não está configurada neste servidor; a edição pelo texto fica indisponível."}
        </Alert>
      </div>
    );
  }

  const range = (() => {
    if (!sel || sel.b === null) return null;
    const words = list.find((x) => x.assetId === sel.assetId)!.words;
    const [i, j] = sel.a <= sel.b ? [sel.a, sel.b] : [sel.b, sel.a];
    return { assetId: sel.assetId, start: words[i].start, end: words[j].end, i, j };
  })();
  const click = (assetId: string, i: number, w: Word) => {
    const t = outTime(assetId, w);
    if (t !== null) actions.seek(t);
    if (!sel || sel.assetId !== assetId || sel.b !== null) setSel({ assetId, a: i, b: null });
    else setSel({ ...sel, b: i });
  };
  const apply = async (op: "remove_source_range" | "restore_source_range") => {
    if (!range) return;
    setBusy(true);
    await actions.runOps([{ op, asset_id: range.assetId, start: Math.max(0, range.start - 0.05), end: range.end + 0.05 }]);
    setSel(null);
    setBusy(false);
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-neutral-400">Clique na primeira e na última palavra para selecionar. <span className="line-through">Riscado</span> = fora do vídeo.</p>
      {range && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-gold-700/50 bg-ink-850 p-2 text-xs">
          <span className="text-neutral-300">{range.j - range.i + 1} palavras · {fmtTime(range.start)}–{fmtTime(range.end)}</span>
          <Button size="sm" variant="primary" loading={busy} onClick={() => apply("remove_source_range")}><Eraser className="h-3.5 w-3.5" /> Remover do vídeo</Button>
          <Button size="sm" loading={busy} onClick={() => apply("restore_source_range")}><RotateCcw className="h-3.5 w-3.5" /> Restaurar</Button>
          <button onClick={() => setSel(null)} className="ml-auto text-neutral-500 hover:text-white" aria-label="Limpar seleção"><X className="h-4 w-4" /></button>
        </div>
      )}
      {list.map((a) => (
        <div key={a.assetId}>
          {list.length > 1 && <p className="label">{names.get(a.assetId) ?? "Vídeo"}</p>}
          <p className="text-[15px] leading-8">
            {a.words.map((w, i) => {
              const inVideo = outTime(a.assetId, w) !== null;
              const selected = sel?.assetId === a.assetId && (sel.b === null ? i === sel.a : i >= Math.min(sel.a, sel.b) && i <= Math.max(sel.a, sel.b));
              return (
                <span key={i}>
                  <button
                    onClick={() => click(a.assetId, i, w)}
                    className={cx("rounded px-0.5 transition", inVideo ? "text-neutral-100 hover:bg-ink-700" : "text-neutral-600 line-through hover:bg-ink-800", selected && "bg-gold-500/30 text-white")}
                    title={fmtTime(w.start)}
                  >
                    {w.text}
                  </button>{" "}
                </span>
              );
            })}
            {!a.words.length && a.segments.map((s, i) => <span key={i} className="text-neutral-400">{s.text} </span>)}
          </p>
          {!a.words.length && a.segments.length > 0 && <p className="text-[11px] text-neutral-500">Este provedor não retornou tempos por palavra; a edição pelo texto requer tempos por palavra.</p>}
        </div>
      ))}
    </div>
  );
}
