"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crosshair, Scissors, Trash2, ZoomIn } from "lucide-react";
import {
  captionCues,
  clipDuration,
  clipsDuration,
  newClipId,
  placeClips,
  round3,
  timelineDuration,
  type Clip,
  type Timeline,
} from "@vision/core";
import { fmtTime } from "@/lib/format";
import { Button, cx } from "../ui";
import type { StudioActions, StudioAsset } from "./types";

interface Props {
  timeline: Timeline;
  assets: StudioAsset[];
  time: number;
  actions: StudioActions;
  readOnly?: boolean;
}

const TRACK_H = 34;

/** Timeline multifaixa: vídeo, áudio original, música, legendas e logo. */
export function TimelineView({ timeline, assets, time, actions, readOnly }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const total = timelineDuration(timeline);
  const clipsEnd = clipsDuration(timeline);
  const placed = useMemo(() => placeClips(timeline), [timeline]);
  const cues = useMemo(() => captionCues(timeline), [timeline]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const pxPerSec = Math.max(6, (zoom * 900) / Math.max(10, total));
  const width = Math.max(600, total * pxPerSec + 40);
  const sel = placed.find((p) => p.clip.id === selected);
  const endCard = timeline.logos.find((l) => l.mode === "end_card");
  const watermark = timeline.logos.find((l) => l.mode === "watermark");

  const step = total > 600 ? 60 : total > 120 ? 10 : total > 30 ? 5 : 1;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - rect.left) / pxPerSec;
    actions.seek(Math.max(0, Math.min(total, t)));
  };

  const update = (clips: Clip[], summary: string) => actions.commitTimeline({ ...timeline, clips }, summary);

  const split = () => {
    const p = placed.find((x) => time > x.outStart + 0.1 && time < x.outEnd - 0.1);
    if (!p) return actions.notify("Posicione o cursor dentro de um trecho para dividir.", "warn");
    const at = round3(p.clip.sourceStart + (time - p.outStart));
    const clips = timeline.clips.flatMap((c) =>
      c.id === p.clip.id ? [{ ...c, sourceEnd: at }, { ...c, id: newClipId(), sourceStart: at }] : [c],
    );
    void update(clips, `Trecho dividido em ${fmtTime(time)}`);
  };
  const remove = () => {
    if (!sel) return;
    if (timeline.clips.length <= 1) return actions.notify("O vídeo precisa de pelo menos um trecho.", "warn");
    void update(timeline.clips.filter((c) => c.id !== sel.clip.id), `Trecho ${sel.index + 1} removido`);
    setSelected(null);
  };
  const move = (dir: -1 | 1) => {
    if (!sel) return;
    const i = sel.index;
    const j = i + dir;
    if (j < 0 || j >= timeline.clips.length) return;
    const clips = [...timeline.clips];
    [clips[i], clips[j]] = [clips[j], clips[i]];
    void update(clips, `Trecho ${i + 1} movido`);
  };
  const patchSelected = (patch: Partial<Clip>, summary: string) => {
    if (!sel) return;
    void update(timeline.clips.map((c) => (c.id === sel.clip.id ? { ...c, ...patch } : c)), summary);
  };

  const selAsset = sel ? byId.get(sel.clip.assetId) : undefined;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-3 py-2">
        <span className="text-xs font-medium text-neutral-400">Timeline</span>
        <span className="font-mono text-xs text-neutral-500">{fmtTime(time)}</span>
        {!readOnly && (
          <>
            <Button size="sm" variant="ghost" onClick={split} title="Dividir no cursor"><Scissors className="h-3.5 w-3.5" /> Dividir</Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={!sel} title="Excluir trecho"><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>
            <Button size="sm" variant="ghost" onClick={() => move(-1)} disabled={!sel || sel.index === 0} title="Mover para a esquerda"><ArrowLeft className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => move(1)} disabled={!sel || sel.index === placed.length - 1} title="Mover para a direita"><ArrowRight className="h-3.5 w-3.5" /></Button>
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          <ZoomIn className="h-3.5 w-3.5" />
          <input type="range" min={1} max={12} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24" aria-label="Zoom da timeline" />
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-28 shrink-0 border-r border-ink-800 pt-6 text-[11px] text-neutral-500">
          {["Vídeo", "Áudio original", "Música", "Legendas", "Logo"].map((l) => (
            <div key={l} className="flex items-center px-3" style={{ height: TRACK_H + 6 }}>{l}</div>
          ))}
        </div>
        <div ref={scroller} className="scroll-thin relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width }}>
            <div className="relative h-6 cursor-pointer border-b border-ink-800" onClick={seekFromEvent}>
              {ticks.map((t) => (
                <span key={t} className="absolute top-0 h-full border-l border-ink-700 pl-1 text-[10px] text-neutral-500" style={{ left: t * pxPerSec }}>{fmtTime(t).replace(/\.\d$/, "")}</span>
              ))}
            </div>
            <div className="relative" onClick={seekFromEvent}>
              <Track>
                {placed.map((p) => {
                  const a = byId.get(p.clip.assetId);
                  return (
                    <button
                      key={p.clip.id}
                      onClick={(e) => { e.stopPropagation(); setSelected(p.clip.id === selected ? null : p.clip.id); actions.seek(p.outStart + 0.01); }}
                      className={cx("absolute top-0 h-full overflow-hidden rounded-md border text-left text-[10px]", p.clip.id === selected ? "border-gold-400 ring-1 ring-gold-400" : "border-ink-600")}
                      style={{ left: p.outStart * pxPerSec, width: Math.max(3, (p.outEnd - p.outStart) * pxPerSec - 2), backgroundImage: a?.thumbnailUrl ? `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url(${a.thumbnailUrl})` : undefined, backgroundSize: "auto 100%", backgroundColor: "#2a2a30" }}
                      title={p.clip.label ?? a?.name}
                    >
                      <span className="block truncate px-1.5 pt-0.5 text-neutral-100">{p.index + 1}{p.clip.zoom > 1 ? ` · ${p.clip.zoom}x` : ""}</span>
                    </button>
                  );
                })}
              </Track>
              <Track>
                {placed.map((p) => (
                  <div key={p.clip.id} className="absolute top-1 bottom-1 rounded bg-sky-900/50" style={{ left: p.outStart * pxPerSec, width: Math.max(2, (p.outEnd - p.outStart) * pxPerSec - 2), opacity: byId.get(p.clip.assetId)?.hasAudio === false ? 0.2 : 0.4 + 0.6 * Math.min(1, p.clip.volume * timeline.audio.originalVolume) }} />
                ))}
              </Track>
              <Track>
                {timeline.audio.music && <div className="absolute top-1 bottom-1 rounded bg-violet-900/60 px-2 text-[10px] leading-6 text-violet-200" style={{ left: 0, width: total * pxPerSec }}>{byId.get(timeline.audio.music.assetId)?.name ?? "Música"}</div>}
              </Track>
              <Track>
                {cues.map((c, i) => (
                  <div key={i} className="absolute top-1 bottom-1 overflow-hidden rounded bg-gold-700/40 px-1 text-[9px] leading-6 text-gold-200" style={{ left: c.start * pxPerSec, width: Math.max(2, (c.end - c.start) * pxPerSec - 1) }} title={c.text}>{c.text}</div>
                ))}
              </Track>
              <Track>
                {watermark && <div className="absolute top-1 bottom-1 rounded bg-emerald-900/40 px-2 text-[10px] leading-6 text-emerald-200" style={{ left: 0, width: clipsEnd * pxPerSec }}>Logo no canto</div>}
                {endCard && <div className="absolute top-1 bottom-1 rounded bg-emerald-800/60 px-2 text-[10px] leading-6 text-emerald-100" style={{ left: clipsEnd * pxPerSec, width: endCard.durationSec * pxPerSec }}>Cartela final</div>}
              </Track>
              <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-gold-400" style={{ left: time * pxPerSec }} />
            </div>
          </div>
        </div>
      </div>

      {sel && !readOnly && (
        <div className="flex flex-wrap items-end gap-3 border-t border-ink-800 px-3 py-2 text-xs">
          <span className="font-medium text-neutral-300">Trecho {sel.index + 1}</span>
          <NumberField key={`${sel.clip.id}-s-${sel.clip.sourceStart}`} label="Início (origem)" value={sel.clip.sourceStart} min={0} max={sel.clip.sourceEnd - 0.1} onCommit={(v) => patchSelected({ sourceStart: v }, `Início do trecho ${sel.index + 1} ajustado`)} />
          <NumberField key={`${sel.clip.id}-e-${sel.clip.sourceEnd}`} label="Fim (origem)" value={sel.clip.sourceEnd} min={sel.clip.sourceStart + 0.1} max={selAsset?.durationSec ?? sel.clip.sourceEnd} onCommit={(v) => patchSelected({ sourceEnd: v }, `Fim do trecho ${sel.index + 1} ajustado`)} />
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">Zoom</span>
            <select className="input w-24 py-1" value={sel.clip.zoom} onChange={(e) => patchSelected({ zoom: Number(e.target.value) }, `Zoom ${e.target.value}x no trecho ${sel.index + 1}`)}>
              {[1, 1.15, 1.3, 1.5, 1.75, 2].map((z) => <option key={z} value={z}>{z}x</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-neutral-500"><Crosshair className="h-3 w-3" /> Enquadramento ({sel.clip.focusSource === "manual" ? "manual" : sel.clip.focusSource === "auto_motion" ? "auto: movimento" : "centro"})</span>
            <input type="range" min={0} max={1} step={0.01} defaultValue={sel.clip.focusX ?? 0.5} key={`${sel.clip.id}-${sel.clip.focusX}`} onMouseUp={(e) => patchSelected({ focusX: Number(e.currentTarget.value), focusSource: "manual" }, `Enquadramento manual no trecho ${sel.index + 1}`)} onTouchEnd={(e) => patchSelected({ focusX: Number(e.currentTarget.value), focusSource: "manual" }, `Enquadramento manual no trecho ${sel.index + 1}`)} className="w-36" />
          </label>
          {sel.clip.focusSource === "manual" && (
            <Button size="sm" variant="ghost" onClick={() => patchSelected({ focusX: null, focusY: null, focusSource: "center" }, `Enquadramento automático no trecho ${sel.index + 1}`)}>Voltar ao automático</Button>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-neutral-500">Volume {Math.round(sel.clip.volume * 100)}%</span>
            <input type="range" min={0} max={2} step={0.05} defaultValue={sel.clip.volume} key={`${sel.clip.id}-v-${sel.clip.volume}`} onMouseUp={(e) => patchSelected({ volume: Number(e.currentTarget.value) }, `Volume do trecho ${sel.index + 1}`)} onTouchEnd={(e) => patchSelected({ volume: Number(e.currentTarget.value) }, `Volume do trecho ${sel.index + 1}`)} className="w-28" />
          </label>
          <span className="text-neutral-500">Duração {clipDuration(sel.clip).toFixed(1)}s{sel.clip.label ? ` · ${sel.clip.label}` : ""}</span>
        </div>
      )}
    </div>
  );
}

function Track({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-ink-850 py-[3px]">
      <div className="relative" style={{ height: TRACK_H }}>{children}</div>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-neutral-500">{label}</span>
      <input
        className="input w-24 py-1 font-mono"
        type="number"
        step={0.1}
        min={min}
        max={max}
        defaultValue={value.toFixed(2)}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (Number.isFinite(n) && Math.abs(n - value) > 0.005) onCommit(round3(Math.min(max, Math.max(min, n))));
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
