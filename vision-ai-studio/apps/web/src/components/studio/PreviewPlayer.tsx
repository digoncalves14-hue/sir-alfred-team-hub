"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  CAPTION_STYLES,
  FORMAT_PRESETS,
  LOOKS,
  captionCues,
  clipsDuration,
  endCardLayout,
  placeClips,
  placeTexts,
  previewTransitionState,
  readableOn,
  sfxEvents,
  timelineDuration,
  transitionEdges,
  type Timeline,
} from "@vision/core";
import { fmtTime } from "@/lib/format";
import { cx } from "../ui";
import type { StudioAsset } from "./types";

export interface PlayerHandle {
  seek: (t: number) => void;
  pause: () => void;
}

interface Props {
  timeline: Timeline;
  assets: StudioAsset[];
  onTime?: (t: number) => void;
  /** Cor de destaque da marca (caixas dos textos animados). */
  accent?: string | null;
}

/**
 * Prévia em tempo real da timeline: toca os trechos da origem em sequência e
 * simula recorte, zoom, legendas, logo e música com os mesmos parâmetros do
 * renderizador. O arquivo renderizado é a referência final.
 */
export const PreviewPlayer = forwardRef<PlayerHandle, Props>(function PreviewPlayer({ timeline, assets, onTime, accent: brandAccent }, ref) {
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
  const edges = useMemo(() => transitionEdges(timeline), [timeline]);
  const texts = useMemo(() => placeTexts(timeline), [timeline]);
  const logoCorner = useLogoCorner(endCard ? (byIdUrl(assets, endCard.assetId) ?? null) : null);

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

  // narração: toca a partir do instante em que começa no vídeo final
  const voRef = useRef<HTMLAudioElement>(null);
  const vo = timeline.audio.voiceover;
  useEffect(() => {
    const a = voRef.current;
    if (!a || !vo) return;
    a.muted = muted;
    a.volume = Math.max(0, Math.min(1, volume * vo.volume));
    const local = time - vo.startSec;
    const inside = local >= 0 && (!a.duration || local < a.duration);
    if (!playing || !inside) {
      if (!a.paused) a.pause();
      if (!playing && inside && Math.abs(a.currentTime - local) > 0.25) a.currentTime = local;
      return;
    }
    if (Math.abs(a.currentTime - local) > 0.3) a.currentTime = local;
    if (a.paused) void a.play().catch(() => {});
  }, [time, playing, muted, volume, vo]);

  // efeitos sonoros na prévia (mesmos instantes do render), sintetizados no navegador
  const sfx = useMemo(() => sfxEvents(timeline), [timeline]);
  const lastSfxTime = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  useEffect(() => {
    const prev = lastSfxTime.current;
    lastSfxTime.current = time;
    if (!playing || muted || time < prev || time - prev > 0.5) return;
    for (const e of sfx) {
      if (e.at > prev && e.at <= time) {
        audioCtx.current ??= new AudioContext();
        playSfx(audioCtx.current, e.kind, volume);
      }
    }
  }, [time, playing, muted, volume, sfx]);

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

  // ---------- acabamento: cor, transição, textos e cartela (mesmas regras do render) ----------
  const look = LOOKS[timeline.look];
  const curPlaced = placed[idx];
  const tr = curPlaced && !inEndCard
    ? previewTransitionState(timeline.transitions.type, edges[idx] ?? { inSec: 0, outSec: 0 }, time - curPlaced.outStart, curPlaced.outEnd - curPlaced.outStart)
    : { overlay: null, overlayOpacity: 0, scale: 1, blurPx: 0, translateX: 0, glitch: false };
  const layerFilter = [look.css, tr.blurPx ? `blur(${tr.blurPx}px)` : "", tr.glitch ? "hue-rotate(70deg) contrast(1.4) saturate(1.6)" : ""].filter(Boolean).join(" ") || undefined;
  const layerTransform = [tr.translateX ? `translateX(${tr.translateX * 100}%)` : "", tr.scale !== 1 ? `scale(${tr.scale})` : ""].filter(Boolean).join(" ") || undefined;
  const accent = endCard?.accentColor ?? brandAccent ?? "#C9A227";
  const unit = portrait ? size.h : size.h * 1.35;
  const activeTexts = inEndCard ? [] : texts.filter((p) => time >= p.start && time < p.end);
  const cardAsset = endCard ? byId.get(endCard.assetId) : undefined;
  const ec = endCard
    ? endCardLayout(timeline, endCard, size.w, size.h, {
        width: cardAsset?.width ?? 1,
        height: cardAsset?.height ?? 1,
        hasAlpha: !logoCorner,
        cornerColor: logoCorner,
      })
    : null;
  const cardBg = ec ? (ec.background.mode === "solid" ? ec.background.c0 : `linear-gradient(135deg, ${ec.background.c0}, ${ec.background.c1})`) : undefined;
  const cardText = ec?.background.mode === "solid" ? readableOn(ec.background.c0) : "#FFFFFF";
  const ctaBox = ec?.background.mode === "solid" && near(accent, ec.background.c0) ? readableOn(ec.background.c0) : accent;
  const logoUrl = (id: string) => byId.get(id)?.url ?? null;

  const ratio = preset.aspect.w / preset.aspect.h;
  return (
    <div className="flex h-full w-full flex-col">
      <style>{FX_CSS}</style>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/60 p-2">
        <div
          ref={frame}
          className="relative overflow-hidden bg-black shadow-2xl"
          style={{ aspectRatio: `${preset.aspect.w} / ${preset.aspect.h}`, height: ratio < 1 ? "100%" : undefined, width: ratio >= 1 ? "100%" : undefined, maxHeight: "100%", maxWidth: "100%" }}
          onClick={() => (playing ? pause() : void play())}
        >
          <div className={cx("absolute inset-0", tr.glitch && "vis-glitch")} style={{ transform: layerTransform, filter: layerFilter }}>
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
          </div>
          {look.vignette && !inEndCard && (
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%)" }} />
          )}
          {tr.overlay && <div className="pointer-events-none absolute inset-0" style={{ background: tr.overlay, opacity: tr.overlayOpacity }} />}
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
          {activeTexts.map((p) => (
            <OverlayText key={p.overlay.id} p={p} unit={unit} size={size} accent={accent} safe={safe} portrait={portrait} font={cs.font} />
          ))}
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
                  ? cue.words.map((w, i) => {
                      const active = time >= w.start && (i === cue.words.length - 1 || time < cue.words[i + 1].start);
                      return (
                        <span key={i}>
                          <span
                            key={active ? `on-${i}` : `off-${i}`}
                            className={active && cs.wordPop ? "vis-pop inline-block" : "inline-block"}
                            style={
                              active && cs.wordMarker
                                ? { background: highlight, color: readableOn(highlight), padding: `0 ${fontPx * 0.12}px`, borderRadius: fontPx * 0.12, textShadow: "none", WebkitTextStroke: "0" }
                                : { color: active ? highlight : primary }
                            }
                          >
                            {w.text}
                          </span>
                          {i < cue.words.length - 1 ? " " : ""}
                        </span>
                      );
                    })
                  : cue.text}
              </span>
            </div>
          )}
          {inEndCard && endCard && ec && (
            <div className="absolute inset-0 overflow-hidden vis-fadein" style={{ background: cardBg }}>
              <div className="absolute inset-0 vis-push" style={{ animationDuration: `${endCard.durationSec}s` }}>
                {logoUrl(endCard.assetId) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl(endCard.assetId)!}
                    alt="Logo"
                    className="absolute"
                    style={{ left: ec.logoBox.x, top: ec.logoBox.y, width: ec.logoBox.w, height: ec.logoBox.h, objectFit: "contain" }}
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-xs text-neutral-500">Logo</span>
                )}
              </div>
              {endCard.headline && (
                <div className="absolute inset-x-0 text-center font-bold vis-rise" style={{ top: ec.headlineY, transform: "translateY(-50%)", color: cardText, fontSize: unit * 0.036, fontFamily: `${cs.font}, Montserrat, Inter, sans-serif`, animationDelay: "0.35s" }}>
                  {endCard.headline}
                </div>
              )}
              {endCard.cta && (
                <div className="absolute inset-x-0 flex justify-center vis-pop" style={{ top: ec.ctaY, transform: "translateY(-50%)", animationDelay: "0.75s" }}>
                  <span className="font-bold uppercase" style={{ background: ctaBox, color: readableOn(ctaBox), fontSize: unit * 0.032, padding: `${unit * 0.008}px ${unit * 0.016}px`, fontFamily: `${cs.font}, Montserrat, Inter, sans-serif` }}>
                    {endCard.cta}
                  </span>
                </div>
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
        {vo && byId.get(vo.assetId)?.url && <audio ref={voRef} src={byId.get(vo.assetId)!.url!} preload="auto" />}
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

const FX_CSS = `
@keyframes visPop { 0% { opacity: 0; transform: scale(.7) } 60% { opacity: 1; transform: scale(1.08) } 100% { opacity: 1; transform: scale(1) } }
@keyframes visFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes visRise { from { opacity: 0; margin-top: 3% } to { opacity: 1; margin-top: 0 } }
@keyframes visPush { from { transform: scale(1) } to { transform: scale(1.06) } }
@keyframes visGlitch { 0% { transform: translate(0,0) } 25% { transform: translate(-2%,1%) } 50% { transform: translate(2%,-1%) } 75% { transform: translate(-1%,-1%) } 100% { transform: translate(0,0) } }
.vis-glitch { animation: visGlitch .12s steps(2) infinite }
.vis-pop { animation: visPop .32s ease-out both }
.vis-fade { animation: visFade .3s ease-out both }
.vis-fadein { animation: visFade .45s ease-out both }
.vis-rise { animation: visRise .4s ease-out both }
.vis-push { animation: visPush linear both }
`;

function OverlayText({
  p,
  unit,
  size,
  accent,
  safe,
  portrait,
  font,
}: {
  p: ReturnType<typeof placeTexts>[number];
  unit: number;
  size: { w: number; h: number };
  accent: string;
  safe: { top: number; bottom: number; left: number; right: number };
  portrait: boolean;
  font: string;
}) {
  const o = p.overlay;
  const upper = o.role === "hook" || o.role === "cta";
  const boxed = o.role === "hook" || o.role === "cta" || o.role === "lower_third";
  const bg = o.role === "lower_third" ? "rgba(17,17,17,.8)" : boxed ? accent : undefined;
  const color = bg && o.role !== "lower_third" ? readableOn(accent) : "#FFFFFF";
  const fontSize = unit * ({ hook: 0.05, title: 0.052, cta: 0.038, lower_third: 0.03 } as const)[o.role];
  const pos: React.CSSProperties =
    o.position === "top"
      ? { top: safe.top * size.h + size.h * 0.04 }
      : o.position === "bottom"
        ? { bottom: safe.bottom * size.h + size.h * 0.17 }
        : { top: "50%", transform: "translateY(-50%)" };
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex ${o.role === "lower_third" ? "justify-start" : "justify-center"}`}
      style={{ ...pos, paddingLeft: safe.left * size.w + size.w * 0.02, paddingRight: safe.right * size.w + size.w * 0.02 }}
    >
      <span
        className={`${o.role === "hook" || o.role === "cta" ? "vis-pop" : "vis-fade"} whitespace-pre-wrap text-center font-bold leading-tight`}
        style={{
          fontSize,
          color,
          background: bg,
          padding: boxed ? `${fontSize * 0.2}px ${fontSize * 0.35}px` : undefined,
          textTransform: upper ? "uppercase" : "none",
          textShadow: boxed ? undefined : "0 0 4px #000, 0 2px 6px rgba(0,0,0,.6)",
          fontFamily: `${font}, Montserrat, Inter, sans-serif`,
          maxWidth: portrait ? "90%" : "75%",
        }}
      >
        {o.text}
      </span>
    </div>
  );
}

/** Mesmos efeitos do render, sintetizados com Web Audio (whoosh = ruído filtrado; pop e impacto = osciladores). */
function playSfx(ctx: AudioContext, kind: "whoosh" | "pop" | "impact", volume: number) {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  out.connect(ctx.destination);
  if (kind === "whoosh") {
    const len = Math.round(ctx.sampleRate * 0.56);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
      d[i] = b * 6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
    src.connect(bp).connect(g).connect(out);
    src.start(now);
    return;
  }
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  if (kind === "pop") {
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.2);
  } else {
    osc.frequency.setValueAtTime(108, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.5);
    g.gain.setValueAtTime(0.9, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.95);
  }
}

function byIdUrl(assets: StudioAsset[], id: string): string | null {
  return assets.find((a) => a.id === id)?.url ?? null;
}

function near(a: string, b: string): boolean {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const d = Math.hypot(((pa >> 16) & 255) - ((pb >> 16) & 255), ((pa >> 8) & 255) - ((pb >> 8) & 255), (pa & 255) - (pb & 255));
  return d < 90;
}

/** Lê o canto da logo: opaco → cor do fundo (a cartela usa essa cor); transparente ou ilegível → null. */
function useLogoCorner(url: string | null): string | null {
  const [corner, setCorner] = useState<string | null>(null);
  useEffect(() => {
    setCorner(null);
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 2;
        c.height = 2;
        const g = c.getContext("2d");
        if (!g) return;
        g.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, Math.max(2, img.naturalWidth), Math.max(2, img.naturalHeight));
        const [r, gg, b, a] = g.getImageData(0, 0, 1, 1).data;
        if (a >= 250) setCorner(`#${[r, gg, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase());
      } catch {
        // imagem sem CORS: mantém o degradê
      }
    };
    img.src = url;
  }, [url]);
  return corner;
}

function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
