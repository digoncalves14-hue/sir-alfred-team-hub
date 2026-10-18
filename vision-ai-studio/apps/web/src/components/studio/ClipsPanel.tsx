"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Play, Scissors, X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { fmtTime } from "@/lib/format";
import { Alert, Badge, Button } from "../ui";
import type { Detail, StudioActions } from "./types";

type Suggestion = { assetId: string; start: number; end: number; duration: number; score: number; title: string; reasons: string[]; transcriptExcerpt: string | null };

const DURATIONS = [15, 30, 45, 60, 90];

/** Vídeo longo → cortes curtos: sugestões aprováveis, cada uma vira um novo projeto. */
export function ClipsPanel({ data, actions }: { data: Detail; actions: StudioActions }) {
  const router = useRouter();
  const [duration, setDuration] = useState(30);
  const [custom, setCustom] = useState("");
  const [count, setCount] = useState(6);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [basis, setBasis] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Record<string, string>>({});
  const urlOf = (id: string) => data.assets.find((a) => a.id === id)?.url;
  const key = (s: Suggestion) => `${s.assetId}:${s.start}`;

  const suggest = async () => {
    setBusy(true);
    try {
      const r = await apiFetch<{ suggestions: Suggestion[]; basis: string }>(`/api/projects/${data.project.id}/suggestions`, {
        method: "POST",
        json: { durationSec: custom ? Number(custom) : duration, count },
      });
      setList(r.suggestions);
      setBasis(r.basis);
      setDiscarded(new Set());
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const approve = async (s: Suggestion) => {
    try {
      const r = await apiFetch<{ id: string }>(`/api/projects/${data.project.id}/clips`, { method: "POST", json: { assetId: s.assetId, start: s.start, end: s.end, title: s.title } });
      setApproved((a) => ({ ...a, [key(s)]: r.id }));
      actions.notify("Corte aprovado: novo projeto criado.", "success");
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs text-neutral-400">Gera sugestões de cortes curtos a partir das gravações completas deste projeto (aula, workshop, entrevista). Cada corte aprovado vira um projeto próprio para editar e exportar.</p>
      <div>
        <p className="label">Duração</p>
        <div className="flex flex-wrap gap-1.5">
          {DURATIONS.map((d) => (
            <button key={d} onClick={() => { setDuration(d); setCustom(""); }} className={`rounded-lg border px-3 py-1.5 text-xs ${!custom && duration === d ? "border-gold-600 bg-gold-700/20 text-gold-200" : "border-ink-700 text-neutral-400"}`}>{d}s</button>
          ))}
          <input className="input w-28 py-1 text-xs" placeholder="Personalizada (s)" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <label className="text-xs text-neutral-400">Quantidade
          <select className="input mt-1 w-20 py-1" value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 6, 10, 15].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <Button variant="primary" onClick={suggest} loading={busy}><Scissors className="h-4 w-4" /> Sugerir cortes</Button>
      </div>
      {list && <Alert>Pontuação é uma <b>estimativa heurística</b> ({basis}): movimento, fala contínua e ausência de silêncio. Não é previsão de engajamento.</Alert>}
      {preview && urlOf(preview.assetId) && (
        <div className="rounded-lg border border-ink-700 bg-black p-2">
          <video key={key(preview)} src={`${urlOf(preview.assetId)}#t=${preview.start},${preview.end}`} controls autoPlay className="max-h-64 w-full" />
        </div>
      )}
      <ul className="space-y-2">
        {list?.filter((s) => !discarded.has(key(s))).map((s) => (
          <li key={key(s)} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="text-[11px] text-neutral-500">{fmtTime(s.start)}–{fmtTime(s.end)} · {Math.round(s.duration)}s</span>
              </span>
              <Badge tone="gold">{s.score}/100</Badge>
            </div>
            {s.transcriptExcerpt && <p className="mt-1 line-clamp-3 text-xs text-neutral-400">“{s.transcriptExcerpt}”</p>}
            {s.reasons.length > 0 && <p className="mt-1 text-[11px] text-neutral-500">{s.reasons.join(" · ")}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPreview(s)}><Play className="h-3.5 w-3.5" /> Ver</Button>
              {approved[key(s)] ? (
                <Button size="sm" onClick={() => router.push(`/projetos/${approved[key(s)]}`)}><Check className="h-3.5 w-3.5 text-emerald-400" /> Abrir projeto</Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => approve(s)}><Check className="h-3.5 w-3.5" /> Aprovar</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDiscarded((d) => new Set(d).add(key(s)))}><X className="h-3.5 w-3.5" /> Descartar</Button>
            </div>
          </li>
        ))}
        {list && !list.length && <p className="text-sm text-neutral-500">Nenhum trecho com essa duração. Tente uma duração menor.</p>}
      </ul>
    </div>
  );
}
