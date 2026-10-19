"use client";
import { useMemo, useState } from "react";
import { Download, Languages } from "lucide-react";
import { CAPTION_STYLES, captionCues, placeClips, round3, type CaptionBlock, type CaptionStyleId, type Timeline } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { fmtTime } from "@/lib/format";
import { Alert, Button, Spinner } from "../ui";
import type { Detail, StudioActions } from "./types";

/** Legendas: geração a partir da transcrição, estilo, posição e edição de texto/tempo. */
export function CaptionsPanel({ data, timeline, actions }: { data: Detail; timeline: Timeline; actions: StudioActions }) {
  const [busy, setBusy] = useState(false);
  const caps = timeline.captions;
  const transcribing = data.jobs.some((j) => j.type === "transcribe" && (j.status === "queued" || j.status === "running"));
  const hasTranscript = data.transcripts.length > 0;
  const cues = useMemo(() => captionCues({ ...timeline, captions: { ...caps, enabled: true } }), [timeline, caps]);
  // blocos visíveis na edição atual, com seu tempo de saída
  const visible = useMemo(() => {
    const placed = placeClips(timeline);
    return caps.blocks
      .map((b) => {
        const p = placed.find((x) => x.clip.assetId === b.assetId && b.end > x.clip.sourceStart && b.start < x.clip.sourceEnd);
        return p ? { b, out: round3(p.outStart + Math.max(0, b.start - p.clip.sourceStart)) } : null;
      })
      .filter(Boolean) as Array<{ b: CaptionBlock; out: number }>;
  }, [timeline, caps.blocks]);

  const setConfig = (patch: Partial<Timeline["captions"]>, summary: string) => actions.commitTimeline({ ...timeline, captions: { ...caps, ...patch } }, summary);
  const enable = async (enabled: boolean) => {
    setBusy(true);
    try {
      const r = await actions.runOps([{ op: "set_captions", enabled, style: null, position: null }], enabled ? "Legendas ativadas" : "Legendas desativadas");
      if (r && r.warnings.length) actions.notify(r.warnings.join(" "), "warn");
    } finally {
      setBusy(false);
    }
  };
  const transcribe = async () => {
    try {
      await apiFetch(`/api/projects/${data.project.id}/transcribe`, { method: "POST" });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };
  const editBlock = (id: string, patch: Partial<CaptionBlock>, summary: string) => {
    const blocks = caps.blocks.map((b) => {
      if (b.id !== id) return b;
      const next = { ...b, ...patch };
      if (patch.text !== undefined) {
        const tokens = patch.text.trim().split(/\s+/);
        next.words = b.words && b.words.length === tokens.length ? b.words.map((w, i) => ({ ...w, text: tokens[i] })) : undefined;
      }
      return next;
    });
    void setConfig({ blocks }, summary);
  };

  return (
    <div className="space-y-4 p-4">
      {!hasTranscript && (
        <Alert tone={data.capabilities.transcription ? "info" : "warn"}>
          {data.capabilities.transcription ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>As legendas usam a transcrição do áudio em português.</span>
              <Button size="sm" variant="primary" onClick={transcribe} loading={transcribing}><Languages className="h-3.5 w-3.5" /> {transcribing ? "Transcrevendo…" : "Gerar transcrição"}</Button>
            </div>
          ) : (
            "A transcrição automática não está configurada neste servidor (OPENAI_API_KEY ou whisper.cpp). Sem ela, não é possível gerar legendas automáticas."
          )}
        </Alert>
      )}
      {hasTranscript && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={caps.enabled ? "secondary" : "primary"} loading={busy} onClick={() => enable(!caps.enabled)}>{caps.enabled ? "Desativar legendas" : "Ativar legendas automáticas"}</Button>
          {transcribing && <span className="flex items-center gap-1 text-xs text-neutral-400"><Spinner /> Transcrevendo…</span>}
          {caps.blocks.length > 0 && (
            <a href={`/api/projects/${data.project.id}/srt`} className="ml-auto inline-flex items-center gap-1 text-xs text-gold-400 hover:underline"><Download className="h-3.5 w-3.5" /> Baixar SRT</a>
          )}
        </div>
      )}

      {caps.blocks.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className="label">Estilo</span>
              <select className="input" value={caps.style} onChange={(e) => setConfig({ style: e.target.value as CaptionStyleId }, `Estilo de legenda: ${CAPTION_STYLES[e.target.value as CaptionStyleId].label}`)}>
                {Object.values(CAPTION_STYLES).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Posição</span>
              <select className="input" value={caps.position} onChange={(e) => setConfig({ position: e.target.value as "bottom" }, "Posição da legenda alterada")}>
                <option value="bottom">Inferior (área segura)</option>
                <option value="center">Centro</option>
                <option value="top">Superior</option>
              </select>
            </label>
            <label>
              <span className="label">Tamanho {Math.round(caps.fontScale * 100)}%</span>
              <input type="range" min={0.6} max={1.8} step={0.05} defaultValue={caps.fontScale} key={caps.fontScale} onMouseUp={(e) => setConfig({ fontScale: Number(e.currentTarget.value) }, "Tamanho da legenda alterado")} onTouchEnd={(e) => setConfig({ fontScale: Number(e.currentTarget.value) }, "Tamanho da legenda alterado")} className="mt-3 w-full" />
            </label>
            <label>
              <span className="label">Cor do texto</span>
              <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-ink-700 bg-ink-850" defaultValue={caps.primaryColor ?? CAPTION_STYLES[caps.style].primary} key={`p${caps.primaryColor}${caps.style}`} onBlur={(e) => setConfig({ primaryColor: e.target.value.toUpperCase() }, "Cor da legenda alterada")} />
            </label>
            <label>
              <span className="label">Cor de destaque</span>
              <input type="color" className="h-9 w-full cursor-pointer rounded-lg border border-ink-700 bg-ink-850" defaultValue={caps.highlightColor ?? CAPTION_STYLES[caps.style].highlight} key={`h${caps.highlightColor}${caps.style}`} onBlur={(e) => setConfig({ highlightColor: e.target.value.toUpperCase() }, "Cor de destaque alterada")} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[#D4AF37]" checked={caps.uppercase ?? CAPTION_STYLES[caps.style].uppercase} onChange={(e) => setConfig({ uppercase: e.target.checked }, e.target.checked ? "Legenda em maiúsculas" : "Legenda sem maiúsculas")} /> Texto em maiúsculas
            </label>
          </div>
          <div>
            <p className="label">Blocos ({visible.length} na edição atual · {cues.length} exibidos)</p>
            <div className="scroll-thin max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
              {visible.map(({ b, out }) => (
                <div key={b.id} className="rounded-lg border border-ink-700 bg-ink-850 p-2">
                  <div className="mb-1 flex items-center gap-1 text-[10px] text-neutral-500">
                    <button className="font-mono hover:text-gold-400" onClick={() => actions.seek(out + 0.01)}>{fmtTime(out)}</button>
                    <span className="ml-auto flex gap-1">
                      <button className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" title="Começar 0,1s antes" onClick={() => editBlock(b.id, { start: round3(Math.max(0, b.start - 0.1)) }, "Tempo da legenda ajustado")}>−0,1</button>
                      <button className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" title="Começar 0,1s depois" onClick={() => editBlock(b.id, { start: round3(Math.min(b.end - 0.1, b.start + 0.1)) }, "Tempo da legenda ajustado")}>+0,1</button>
                      <span className="px-1">fim</span>
                      <button className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" onClick={() => editBlock(b.id, { end: round3(Math.max(b.start + 0.1, b.end - 0.1)) }, "Tempo da legenda ajustado")}>−0,1</button>
                      <button className="rounded bg-ink-700 px-1.5 hover:bg-ink-600" onClick={() => editBlock(b.id, { end: round3(b.end + 0.1) }, "Tempo da legenda ajustado")}>+0,1</button>
                    </span>
                  </div>
                  <input
                    className="w-full bg-transparent text-sm text-neutral-100 outline-none focus:text-white"
                    defaultValue={b.text}
                    key={b.text}
                    maxLength={300}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== b.text && editBlock(b.id, { text: e.target.value.trim() }, "Texto da legenda editado")}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
