"use client";
import { useState } from "react";
import { Download, Eye, FileText, RotateCcw, Square } from "lucide-react";
import { FORMAT_PRESETS, FORMAT_PRESET_IDS, resolutionAllowed, type FormatPresetId, type Timeline } from "@vision/core";
import { apiFetch } from "@/lib/client";
import { fmtBytes, fmtDate, fmtDuration } from "@/lib/format";
import { Alert, Button, Progress, StatusBadge, cx } from "../ui";
import type { Detail, StudioActions } from "./types";

const RENDER_LABEL: Record<string, string> = { queued: "Na fila", running: "Renderizando", succeeded: "Concluído", failed: "Falhou", canceled: "Cancelado" };

/** Exportação MP4/H.264 (única ou em lote), com progresso real e download. */
export function ExportPanel({ data, timeline, actions, onPlayRender }: { data: Detail; timeline: Timeline; actions: StudioActions; onPlayRender: (url: string) => void }) {
  const initial = (data.project.destinations.length ? data.project.destinations : [timeline.format.preset]) as FormatPresetId[];
  const [presets, setPresets] = useState<FormatPresetId[]>(initial.includes(timeline.format.preset) ? initial : [timeline.format.preset, ...initial]);
  const [resolution, setResolution] = useState<"720p" | "1080p" | "2160p">("1080p");
  const [quality, setQuality] = useState<"high" | "balanced" | "light">("balanced");
  const [bitrate, setBitrate] = useState("");
  const [fps, setFps] = useState<string>("");
  const [busy, setBusy] = useState<"export" | "preview" | null>(null);
  const source = data.assets.find((a) => a.role === "source" && a.width);
  const can4k = source ? resolutionAllowed("2160p", source.width ?? 0, source.height ?? 0) : false;

  const start = async (kind: "export" | "preview") => {
    setBusy(kind);
    try {
      await apiFetch(`/api/projects/${data.project.id}/renders`, {
        method: "POST",
        json: {
          kind,
          presets: kind === "preview" ? [timeline.format.preset] : presets,
          resolution: kind === "preview" ? "720p" : resolution,
          quality,
          videoBitrateKbps: bitrate ? Number(bitrate) : null,
          fps: fps ? Number(fps) : null,
        },
      });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const jobAction = async (jobId: string | null, action: "cancel" | "retry") => {
    if (!jobId) return;
    try {
      await apiFetch(`/api/jobs/${jobId}/${action}`, { method: "POST" });
      await actions.refresh();
    } catch (e) {
      actions.notify((e as Error).message, "error");
    }
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <Button className="w-full" onClick={() => start("preview")} loading={busy === "preview"}><Eye className="h-4 w-4" /> Gerar prévia renderizada (480p)</Button>
        <p className="mt-1 text-[11px] text-neutral-500">Renderiza rapidamente a versão atual exatamente como será exportada.</p>
      </div>
      <div>
        <p className="label">Formatos (exportação em lote)</p>
        <div className="flex flex-wrap gap-1.5">
          {FORMAT_PRESET_IDS.map((p) => (
            <button key={p} onClick={() => setPresets((c) => (c.includes(p) ? (c.length > 1 ? c.filter((x) => x !== p) : c) : [...c, p]))} className={cx("rounded-lg border px-2.5 py-1.5 text-xs", presets.includes(p) ? "border-gold-600 bg-gold-700/20 text-gold-200" : "border-ink-700 text-neutral-400 hover:border-ink-500")}>
              {FORMAT_PRESETS[p].label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Resolução</span>
          <select className="input" value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)}>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="2160p" disabled={!can4k}>4K {can4k ? "" : "(origem insuficiente)"}</option>
          </select>
        </label>
        <label>
          <span className="label">Qualidade</span>
          <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="high">Alta</option>
            <option value="balanced">Equilibrada</option>
            <option value="light">Arquivo leve</option>
          </select>
        </label>
        <label>
          <span className="label">Bitrate (kbps, opcional)</span>
          <input className="input" inputMode="numeric" placeholder="Automático" value={bitrate} onChange={(e) => setBitrate(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label>
          <span className="label">FPS</span>
          <select className="input" value={fps} onChange={(e) => setFps(e.target.value)}>
            <option value="">Do projeto ({timeline.format.fps})</option>
            {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>
      <Button variant="primary" className="w-full" onClick={() => start("export")} loading={busy === "export"}>
        <Download className="h-4 w-4" /> Exportar {presets.length > 1 ? `${presets.length} versões` : "MP4"}
      </Button>
      <p className="text-[11px] text-neutral-500">MP4 · H.264 · AAC 48 kHz. Publicação direta em redes sociais ainda não está integrada: baixe o arquivo e publique manualmente.</p>

      <div>
        <p className="label">Renderizações</p>
        {!data.renders.length && <p className="text-sm text-neutral-500">Nenhuma renderização ainda.</p>}
        <ul className="space-y-2">
          {data.renders.map((r) => {
            const job = data.jobs.find((j) => j.id === r.jobId);
            const outdated = r.versionId !== data.currentVersion?.id;
            return (
              <li key={r.id} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.kind === "preview" ? "Prévia · " : ""}{FORMAT_PRESETS[r.preset as FormatPresetId]?.label ?? r.preset}</span>
                    <span className="text-[11px] text-neutral-500">
                      {fmtDate(r.createdAt)} · {String((r.settings as { resolution?: string }).resolution ?? "")}
                      {r.width ? ` · ${r.width}×${r.height}` : ""}{r.durationSec ? ` · ${fmtDuration(r.durationSec)}` : ""}{r.sizeBytes ? ` · ${fmtBytes(r.sizeBytes)}` : ""}
                      {outdated ? " · versão anterior" : ""}
                    </span>
                  </span>
                  <StatusBadge status={r.status} label={RENDER_LABEL[r.status] ?? r.status} />
                </div>
                {(r.status === "running" || r.status === "queued") && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={job?.progress ?? r.progress} />
                    <span className="w-10 text-right text-[11px] tabular-nums text-neutral-400">{Math.round((job?.progress ?? r.progress) * 100)}%</span>
                    <button onClick={() => jobAction(r.jobId, "cancel")} className="text-neutral-400 hover:text-red-300" title="Cancelar"><Square className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {r.status === "failed" && <Alert tone="error">{r.errorMessage ?? "Falha na renderização."}</Alert>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.playUrl && <Button size="sm" variant="ghost" onClick={() => onPlayRender(r.playUrl!)}><Eye className="h-3.5 w-3.5" /> Assistir</Button>}
                  {r.downloadUrl && r.kind === "export" && <a href={r.downloadUrl} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold-500 px-3 text-xs font-semibold text-ink-950 hover:bg-gold-400"><Download className="h-3.5 w-3.5" /> Baixar MP4</a>}
                  {r.srtUrl && <a href={r.srtUrl} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-600 px-3 text-xs hover:bg-ink-700"><FileText className="h-3.5 w-3.5" /> SRT</a>}
                  {(r.status === "failed" || r.status === "canceled") && <Button size="sm" onClick={() => jobAction(r.jobId, "retry")}><RotateCcw className="h-3.5 w-3.5" /> Tentar novamente</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
