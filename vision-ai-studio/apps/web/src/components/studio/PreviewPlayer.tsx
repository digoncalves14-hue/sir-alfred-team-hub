"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  CAPTION_STYLES,
  FORMAT_PRESETS,
  captionCues,
  clipsDuration,
  placeClips,
  timelineDuration,
  type Timeline,
} from "@vision/core";
import { fmtTime } from "@/lib/format";
import type { StudioAsset } from "./types";

export interface PlayerHandle {
  seek: (t: number) => void;
  pause: () => void;
}

interface Props {
  timeline: Timeline;
  assets: StudioAsset[];
  onTime?: (t: number) => void;
}

/**
 * Prévia em tempo real da timeline: toca os trechos da origem em sequência e
 * simula recorte, zoom, legendas, logo e música com os mesmos parâmetros do
 * renderizador. O arquivo renderizado é a referência final.
 */
export const PreviewPlayer = forwardRef<PlayerHandle, Props>(function PreviewPlayer({ timeline, assets, onTime }, ref) {
  const frame = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const music = useRef<HTMLAudioElement>(null);
  const raf = useRef<number | null>(null);
  const endCardStart = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [idx, setIdx] = useState(0);
  const [inEndCard, setInEndCard] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [size, setSize] = useState({ w: 360, h: 640 });
  const idxRef = useRef(0);

  const placed = useMemo(() => placeClips(timeline), [timeline]);
  const clipsEnd = clipsDuration(timeline);
  const total = timelineDuration(timeline);
  const cues = useMemo(() => captionCues(timeline), [timeline]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const preset = FORMAT_PRESETS[timeline.format.preset];
  const endCard = timeline.logos.find((l) => l.mode === "end_card");
  const watermark = timeline.logos.find((l) => l.mode === "watermark");
  const assetIds = useMemo(() => [...new Set(timeline.clips.map((c) => c.assetId))], [timeline.clips]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updateTime = useCallback(
    (t: number) => {
      setTime(t);
      onTime?.(t);
    },
    [onTime],
  );

  const applyVolume = useCallback(
    (i: number) => {
      const p = placed[i];
      for (const [id, v] of videos.current) {
        v.muted = muted;
        v.volume = p && id === p.clip.assetId ? Math.min(1, volume * p.clip.volume * timeline.audio.originalVolume) : 0;
      }
      if (music.current && timeline.audio.music) {
        music.current.muted = muted;
        music.current.volume = Math.min(1, volume * timeline.audio.music.volume);
      }
    },
    [placed, muted, volume, timeline.audio],
  );

  const stopLoop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const pause = useCallback(() => {
    stopLoop();
    for (const v of videos.current.values()) v.pause();
    music.current?.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback(
    (t: number) => {
      const tt = Math.max(0, Math.min(total - 0.01, t));
      if (tt >= clipsEnd && endCard) {
        setInEndCard(true);
        endCardStart.current = performance.now() - (tt - clipsEnd) * 1000;
        for (const v of videos.current.values()) v.pause();
        updateTime(tt);
        return;
      }
      setInEndCard(false);
      endCardStart.current = null;
      const i = Math.max(0, placed.findIndex((p) => tt >= p.outStart && tt < p.outEnd));
      const p = placed[i];
      if (!p) return;
      idxRef.current = i;
      setIdx(i);
      const v = videos.current.get(p.clip.assetId);
      if (v) v.currentTime = p.clip.sourceStart + (tt - p.outStart);
      for (const [id, other] of videos.current) if (id !== p.clip.assetId) other.pause();
      if (music.current?.duration) music.current.currentTime = tt % music.current.duration;
      applyVolume(i);
      updateTime(tt);
    },
    [placed, total, clipsEnd, endCard, applyVolume, updateTime],
  );

  useImperativeHandle(ref, () => ({ seek, pause }), [seek, pause]);

  // reposiciona quando a timeline muda (nova versão)
  useEffect(() => {
    pause();
    seek(Math.min(time, Math.max(0, total - 0.05)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline]);

  useEffect(() => applyVolume(idx), [applyVolume, idx]);

  const loop = useCallback(() => {
    let i = idxRef.current;
    if (endCardStart.current !== null) {
      const t = clipsEnd + (performance.now() - endCardStart.current) / 1000;
      if (t >= total) {
        pause();
        updateTime(total);
        return;
      }
      updateTime(t);
      raf.current = requestAnimationFrame(loop);
      return;
    }
    const p = placed[i];
    const v = p && videos.current.get(p.clip.assetId);
    if (!p || !v) return;
    if (v.currentTime >= p.clip.sourceEnd - 0.03 || v.ended) {
      i += 1;
      const next = placed[i];
      if (!next) {
        if (endCard) {
          v.pause();
          setInEndCard(true);
          endCardStart.current = performance.now();
          raf.current = requestAnimationFrame(loop);
          return;
        }
        pause();
        updateTime(clipsEnd);
        return;
      }
      const nv = videos.current.get(next.clip.assetId)!;
      if (nv !== v) v.pause();
      nv.currentTime = next.clip.sourceStart;
      void nv.play().catch(() => {});
      idxRef.current = i;
      setIdx(i);
      applyVolume(i);
    } else {
      updateTime(p.outStart + Math.max(0, v.currentTime - p.clip.sourceStart));
    }
    raf.current = requestAnimationFrame(loop);
  }, [placed, clipsEnd, total, endCard, pause, updateTime, applyVolume]);

  const play = async () => {
    if (time >= total - 0.05) seek(0);
    const p = placed[idxRef.current];
    if (!inEndCard && p) {
      const v = videos.current.get(p.clip.assetId);
      try {
        await v?.play();
      } catch {
        return;
      }
    } else if (inEndCard) {
      endCardStart.current = performance.now() - (time - clipsEnd) * 1000;
    }
    if (music.current && timeline.audio.music) void music.current.play().catch(() => {});
    setPlaying(true);
    stopLoop();
    raf.current = requestAnimationFrame(loop);
  };

  useEffect(() => () => stopLoop(), []);

  // ---------- geometria do recorte (mesma matemática do renderizador) ----------
  const cur = placed[idx]?.clip;
  const curAsset = cur ? byId.get(cur.assetId) : undefined;
  const videoStyle = (assetId: string): React.CSSProperties => {
    const a = byId.get(assetId);
    const active = cur?.assetId === assetId && !inEndCard;
    const base: React.CSSProperties = { position: "absolute", visibility: active ? "visible" : "hidden" };
    if (!a?.width || !a.height || !cur) return { ...base, inset: 0, width: "100%", height: "100%", objectFit: "contain" };
    const mode = cur.zoom > 1.001 ? "fill" : timeline.format.reframe;
    if (mode === "fill") {
      const scale = Math.max(size.w / a.width, size.h / a.height) * cur.zoom;
      const dw = a.width * scale;
      const dh = a.height * scale;
      const fx = cur.focusX ?? 0.5;
      const fy = cur.focusY ?? 0.5;
      const left = Math.min(0, Math.max(size.w - dw, size.w / 2 - dw * fx));
      const top = Math.min(0, Math.max(size.h - dh, size.h / 2 - dh * fy));
      return { ...base, width: dw, height: dh, left, top, maxWidth: "none" };
    }
    return { ...base, inset: 0, width: "100%", height: "100%", objectFit: "contain" };
  };

  // ---------- legenda ativa ----------
  const cue = !inEndCard ? cues.find((c) => time >= c.start && time < c.end) : undefined;
  const cs = CAPTION_STYLES[timeline.captions.style];
  const portrait = preset.aspect.w < preset.aspect.h;
  const fontPx = size.h * cs.sizeRatio * timeline.captions.fontScale * (portrait ? 0.9 : 1.15);
  const safe = preset.safeArea;
  const primary = timeline.captions.primaryColor ?? cs.primary;
  const highlight = timeline.captions.highlightColor ?? cs.highlight;
  const upper = timeline.captions.uppercase ?? cs.uppercase;
  const capPos: React.CSSProperties =
    timeline.captions.position === "top"
      ? { top: safe.top * size.h }
      : timeline.captions.position === "center"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: safe.bottom * size.h };
  const outline = Math.max(1, size.h * cs.outlineWidthRatio);
  const music0 = timeline.audio.music ? byId.get(timeline.audio.music.assetId) : undefined;
  const logoUrl = (id: string) => byId.get(id)?.url ?? null;

  const ratio = preset.aspect.w / preset.aspect.h;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/60 p-2">
        <div
          ref={frame}
          className="relative overflow-hidden bg-black shadow-2xl"
          style={{ aspectRatio: `${preset.aspect.w} / ${preset.aspect.h}`, height: ratio < 1 ? "100%" : undefined, width: ratio >= 1 ? "100%" : undefined, maxHeight: "100%", maxWidth: "100%" }}
          onClick={() => (playing ? pause() : void play())}
        >
          {timeline.format.reframe === "fit_blur" && curAsset?.thumbnailUrl && (cur?.zoom ?? 1) <= 1.001 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={curAsset.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl brightness-75" />
          )}
          {assetIds.map((id) => {
            const a = byId.get(id);
            return a?.url ? (
              <video
                key={id}
                ref={(el) => {
                  if (el) videos.current.set(id, el);
                  else videos.current.delete(id);
                }}
                src={a.url}
                preload="auto"
                playsInline
                style={videoStyle(id)}
                onLoadedMetadata={() => id === cur?.assetId && seek(time)}
              />
            ) : null;
          })}
          {!curAsset?.url && !inEndCard && (
            <div className="absolute inset-0 grid place-items-center text-xs text-neutral-500">Vídeo em processamento…</div>
          )}
          {watermark && !inEndCard && logoUrl(watermark.assetId) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(watermark.assetId)!}
              alt="Logo"
              className="pointer-events-none absolute opacity-85"
              style={{
                width: `${watermark.scale * 100}%`,
                top: watermark.position.startsWith("top") ? Math.max(size.h * safe.top, Math.min(size.w, size.h) * 0.04) : undefined,
                bottom: watermark.position.startsWith("bottom") ? Math.max(size.h * safe.bottom, Math.min(size.w, size.h) * 0.04) : undefined,
                left: watermark.position.endsWith("left") ? Math.min(size.w, size.h) * 0.04 : undefined,
                right: watermark.position.endsWith("right") ? Math.min(size.w, size.h) * 0.04 : undefined,
              }}
            />
          )}
          {cue && (
            <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ ...capPos, paddingLeft: safe.left * size.w, paddingRight: safe.right * size.w }}>
              <span
                className="whitespace-pre-wrap text-center leading-tight"
                style={{
                  fontFamily: `${cs.font}, Montserrat, Inter, sans-serif`,
                  fontSize: fontPx,
                  fontWeight: cs.bold ? 700 : 500,
                  color: primary,
                  textTransform: upper ? "uppercase" : "none",
                  background: cs.box ? hexA(cs.boxColor, cs.boxAlpha) : undefined,
                  padding: cs.box ? `${fontPx * 0.15}px ${fontPx * 0.35}px` : undefined,
                  borderRadius: cs.box ? fontPx * 0.15 : undefined,
                  textShadow: cs.box ? undefined : `0 0 ${outline}px ${cs.outline}, 0 0 ${outline}px ${cs.outline}, 0 ${outline}px ${outline * 2}px rgba(0,0,0,.6)`,
                  WebkitTextStroke: !cs.box && outline > 1.5 ? `${outline * 0.6}px ${cs.outline}` : undefined,
                  maxWidth: "100%",
                }}
              >
                {cs.wordHighlight && cue.words.length > 1
                  ? cue.words.map((w, i) => (
                      <span key={i} style={{ color: time >= w.start && (i === cue.words.length - 1 || time < cue.words[i + 1].start) ? highlight : primary }}>
                        {w.text}{i < cue.words.length - 1 ? " " : ""}
                      </span>
                    ))
                  : cue.text}
              </span>
            </div>
          )}
          {inEndCard && endCard && (
            <div className="absolute inset-0 grid place-items-center" style={{ background: endCard.backgroundColor }}>
              {logoUrl(endCard.assetId) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl(endCard.assetId)!} alt="Logo" style={{ width: `${endCard.scale * 100}%` }} />
              ) : (
                <span className="text-xs text-neutral-500">Logo</span>
              )}
            </div>
          )}
          {!playing && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55 backdrop-blur"><Play className="ml-1 h-6 w-6 text-white" /></span>
            </div>
          )}
        </div>
        {music0?.url && <audio ref={music} src={music0.url} preload="auto" loop />}
      </div>
      <div className="mt-2 flex items-center gap-3 px-1">
        <button onClick={() => (playing ? pause() : void play())} className="grid h-9 w-9 place-items-center rounded-full bg-gold-500 text-ink-950 hover:bg-gold-400" aria-label={playing ? "Pausar" : "Reproduzir"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-neutral-400">{fmtTime(time)} / {fmtTime(total)}</span>
        <input type="range" min={0} max={Math.max(0.1, total)} step={0.05} value={Math.min(time, total)} onChange={(e) => seek(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Posição" />
        <button onClick={() => setMuted((m) => !m)} className="text-neutral-400 hover:text-white" aria-label={muted ? "Ativar som" : "Silenciar"}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="hidden w-20 sm:block" aria-label="Volume" />
        <button onClick={() => frame.current?.requestFullscreen?.()} className="text-neutral-400 hover:text-white" aria-label="Tela cheia">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
