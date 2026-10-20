import { z } from "zod";
import { FORMAT_PRESETS, Resolution, even, outputDimensions } from "./presets";
import { type Clip, type Timeline, clipDuration, clipsDuration, endCardDuration, round3 } from "./timeline";
import { SFX_SOURCES, clipEffectsChain, endCardLayout, sfxEvents, transitionEdges } from "./effects";

/**
 * Converte uma timeline validada em argumentos do FFmpeg.
 * - Todos os valores numéricos são calculados aqui (nada de texto livre no filtro).
 * - Os argumentos são um array passado a spawn() sem shell: não há como injetar comandos.
 * - O grafo de filtros é gravado em arquivo (-filter_complex_script) para não estourar
 *   o limite de tamanho de argumento em projetos com muitos cortes.
 */

export const RenderSettingsSchema = z.object({
  resolution: Resolution.default("1080p"),
  /** Sobrescreve o lado menor (usado para prévias rápidas, ex.: 480). */
  shortSideOverride: z.number().int().min(240).max(2160).nullable().default(null),
  fps: z.number().int().min(12).max(60).nullable().default(null),
  quality: z.enum(["high", "balanced", "light"]).default("balanced"),
  videoBitrateKbps: z.number().int().min(300).max(80000).nullable().default(null),
  encoderPreset: z.enum(["ultrafast", "veryfast", "faster", "medium", "slow"]).default("veryfast"),
});
export type RenderSettings = z.infer<typeof RenderSettingsSchema>;

export interface RenderAsset {
  path: string;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
  duration: number;
}

export interface RenderInputs {
  assets: Map<string, RenderAsset>;
  images: Map<string, string>;
  audios: Map<string, string>;
  /** Arquivo .ass já gerado (legendas, textos animados e textos da cartela) ou null. */
  assPath: string | null;
  /** Dimensões e transparência das imagens de logo (cartela animada e cor de fundo). */
  logoMeta?: Map<string, LogoMeta>;
  fontsDir: string | null;
}

export interface LogoMeta {
  width: number;
  height: number;
  hasAlpha: boolean;
  /** Cor do canto da imagem quando ela tem fundo opaco (#RRGGBB). */
  cornerColor: string | null;
}

export interface RenderCommand {
  /** Argumentos para o executável ffmpeg (sem o nome do executável). */
  args: string[];
  /** Conteúdo do grafo de filtros a ser gravado em `filterScriptPath`. */
  filterGraph: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

const CRF = { high: 18, balanced: 21, light: 26 } as const;

export function renderDimensions(tl: Timeline, s: RenderSettings): { width: number; height: number } {
  if (s.shortSideOverride) {
    const { aspect } = FORMAT_PRESETS[tl.format.preset];
    const short = s.shortSideOverride;
    return aspect.w >= aspect.h
      ? { width: even((short * aspect.w) / aspect.h), height: even(short) }
      : { width: even(short), height: even((short * aspect.h) / aspect.w) };
  }
  return outputDimensions(tl.format.preset, s.resolution);
}

export function buildRenderCommand(
  tl: Timeline,
  inputs: RenderInputs,
  settingsInput: Partial<RenderSettings>,
  outputPath: string,
  filterScriptPath: string,
): RenderCommand {
  const s = RenderSettingsSchema.parse(settingsInput);
  if (!tl.clips.length) throw new Error("A timeline não tem clipes.");
  const { width: W, height: H } = renderDimensions(tl, s);
  const fps = s.fps ?? tl.format.fps;
  const args: string[] = ["-hide_banner", "-nostdin", "-y", "-loglevel", "error"];
  const graph: string[] = [];
  let inputIndex = 0;
  const segV: string[] = [];
  const segA: string[] = [];
  const edges = transitionEdges(tl);

  tl.clips.forEach((clip, i) => {
    const asset = inputs.assets.get(clip.assetId);
    if (!asset) throw new Error(`Arquivo do clipe ${i + 1} não encontrado.`);
    if (!asset.hasVideo) throw new Error(`O arquivo do clipe ${i + 1} não contém vídeo.`);
    const start = Math.max(0, Math.min(clip.sourceStart, asset.duration));
    const dur = Math.max(0.04, Math.min(clipDuration(clip), asset.duration - start));
    args.push("-ss", n(start), "-t", n(dur), "-i", asset.path);
    const k = inputIndex++;
    const vf = `[${k}:v]setpts=PTS-STARTPTS,fps=${fps},${reframeChain(clip, asset, W, H, tl.format.reframe, i, graph)}`;
    const fx = clipEffectsChain(tl, edges[i], dur, W, H, fps);
    graph.push(`${vf}${fx ? `,${fx}` : ""}[v${i}]`);
    // micro fades no áudio dos cortes com transição (evita estalos); no fade pelo preto, mergulho curto
    const aIn = edges[i].inSec > 0 ? Math.min(tl.transitions.type === "fade" ? 0.12 : 0.03, edges[i].inSec) : 0;
    const aOut = edges[i].outSec > 0 ? Math.min(tl.transitions.type === "fade" ? 0.12 : 0.03, edges[i].outSec) : 0;
    const afx = `${aIn ? `,afade=t=in:st=0:d=${n(aIn)}` : ""}${aOut ? `,afade=t=out:st=${n(Math.max(0, dur - aOut))}:d=${n(aOut)}` : ""}`;
    const vol = round3(clip.volume * tl.audio.originalVolume);
    if (asset.hasAudio) {
      graph.push(
        `[${k}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vol},apad,atrim=0:${n(dur)}${afx}[a${i}]`,
      );
    } else {
      graph.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${n(dur)},aformat=sample_fmts=fltp[a${i}]`);
    }
    segV.push(`[v${i}]`);
    segA.push(`[a${i}]`);
  });

  const card = tl.logos.find((l) => l.mode === "end_card");
  const cardDur = endCardDuration(tl);
  if (card) {
    const logoPath = inputs.images.get(card.assetId);
    if (!logoPath) throw new Error("Arquivo da logo oficial não encontrado.");
    const meta = inputs.logoMeta?.get(card.assetId) ?? { width: 1, height: 1, hasAlpha: true, cornerColor: null };
    const ec = endCardLayout(tl, card, W, H, meta);
    args.push("-loop", "1", "-t", n(cardDur), "-i", logoPath);
    const k = inputIndex++;
    // fundo: degradê animado nas cores da marca, ou a cor do fundo da própria logo (logo sem transparência)
    if (ec.background.mode === "gradient") {
      graph.push(
        `gradients=s=${W}x${H}:r=${fps}:d=${n(cardDur)}:c0=${hexToFfmpeg(ec.background.c0)}:c1=${hexToFfmpeg(ec.background.c1)}:nb_colors=2:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.015,format=yuv420p[ecbg]`,
      );
    } else {
      graph.push(`color=c=${hexToFfmpeg(ec.background.c0)}:s=${W}x${H}:r=${fps}:d=${n(cardDur)},format=yuv420p[ecbg]`);
    }
    graph.push(`[${k}:v]scale=${ec.logoBox.w}:${ec.logoBox.h}:flags=lanczos,format=rgba[eclogo]`);
    // logo entra com leve aproximação contínua (push-in) e a cartela aparece com fade
    const frames = Math.max(1, Math.round(cardDur * fps));
    graph.push(
      `[ecbg][eclogo]overlay=${ec.logoBox.x}:${ec.logoBox.y}:shortest=1,scale=${W * 2}:${H * 2}:flags=bicubic,` +
        `zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps},` +
        `fade=t=in:st=0:d=0.45:color=${tl.transitions.type === "flash" ? "white" : "black"},setsar=1,format=yuv420p[vend]`,
    );
    graph.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${n(cardDur)},aformat=sample_fmts=fltp[aend]`);
    segV.push("[vend]");
    segA.push("[aend]");
  }

  const total = round3(clipsDuration(tl) + cardDur);
  const pairs = segV.map((v, i) => `${v}${segA[i]}`).join("");
  graph.push(`${pairs}concat=n=${segV.length}:v=1:a=1[vcat][acat]`);

  // vídeo: legenda + marca d'água
  let vLabel = "[vcat]";
  if (inputs.assPath) {
    const fontsOpt = inputs.fontsDir ? `:fontsdir=${escapeFilterPath(inputs.fontsDir)}` : "";
    graph.push(`${vLabel}ass=filename=${escapeFilterPath(inputs.assPath)}${fontsOpt}[vsub]`);
    vLabel = "[vsub]";
  }
  const wm = tl.logos.find((l) => l.mode === "watermark");
  if (wm) {
    const wmPath = inputs.images.get(wm.assetId);
    if (!wmPath) throw new Error("Arquivo da logo oficial não encontrado.");
    args.push("-loop", "1", "-t", n(total), "-i", wmPath);
    const k = inputIndex++;
    const lw = even(W * wm.scale);
    const m = Math.round(Math.min(W, H) * 0.04);
    const safe = FORMAT_PRESETS[tl.format.preset].safeArea;
    const top = Math.max(m, Math.round(safe.top * H));
    const bottom = Math.max(m, Math.round(safe.bottom * H));
    const pos = {
      top_left: `${m}:${top}`,
      top_right: `W-w-${m}:${top}`,
      bottom_left: `${m}:H-h-${bottom}`,
      bottom_right: `W-w-${m}:H-h-${bottom}`,
    }[wm.position];
    graph.push(`[${k}:v]scale=${lw}:-2:flags=lanczos,format=rgba,colorchannelmixer=aa=0.85[wm]`);
    graph.push(`${vLabel}[wm]overlay=${pos}:enable='lt(t,${n(clipsDuration(tl))})':shortest=1[vwm]`);
    vLabel = "[vwm]";
  }
  graph.push(`${vLabel}format=yuv420p[vout]`);

  // áudio: limpeza, música com ducking e normalização
  let aLabel = "[acat]";
  if (tl.audio.denoise) {
    graph.push(`${aLabel}afftdn=nf=-25[adn]`);
    aLabel = "[adn]";
  }
  // narração entra antes da música: o ducking passa a reagir também à voz do narrador
  const vo = tl.audio.voiceover;
  if (vo) {
    const voPath = inputs.audios.get(vo.assetId);
    if (!voPath) throw new Error("Arquivo da narração não encontrado.");
    args.push("-i", voPath);
    const k = inputIndex++;
    const ms = Math.round(vo.startSec * 1000);
    graph.push(
      `[${k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${round3(vo.volume)},adelay=${ms}|${ms},apad,atrim=0:${n(total)}[vo]`,
    );
    graph.push(`${aLabel}[vo]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[avo]`);
    aLabel = "[avo]";
  }
  const music = tl.audio.music;
  if (music) {
    const mPath = inputs.audios.get(music.assetId);
    if (!mPath) throw new Error("Arquivo de música não encontrado.");
    args.push("-stream_loop", "-1", "-i", mPath);
    const k = inputIndex++;
    const fadeOutStart = Math.max(0, total - music.fadeOutSec);
    graph.push(
      `[${k}:a]atrim=0:${n(total)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${round3(music.volume)},afade=t=in:st=0:d=${n(music.fadeInSec)},afade=t=out:st=${n(fadeOutStart)}:d=${n(music.fadeOutSec)}[mus]`,
    );
    if (music.ducking) {
      graph.push(`${aLabel}asplit=2[voice][vkey]`);
      graph.push(`[mus][vkey]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450:makeup=1[mduck]`);
      graph.push(`[voice][mduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    } else {
      graph.push(`${aLabel}[mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amix]`);
    }
    aLabel = "[amix]";
  }
  // efeitos sonoros sintetizados (whoosh, pop, impacto), posicionados no tempo do vídeo final
  const sfx = sfxEvents(tl).filter((e) => e.at < total - 0.05);
  if (sfx.length) {
    sfx.forEach((e, i) => {
      const ms = Math.round(e.at * 1000);
      graph.push(`${SFX_SOURCES[e.kind].src},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${ms}|${ms}[sfx${i}]`);
    });
    graph.push(`${sfx.map((_, i) => `[sfx${i}]`).join("")}amix=inputs=${sfx.length}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=0:${n(total)}[sfxmix]`);
    graph.push(`${aLabel}[sfxmix]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[asfx]`);
    aLabel = "[asfx]";
  }
  if (tl.audio.normalize) {
    graph.push(`${aLabel}loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[anorm]`);
    aLabel = "[anorm]";
  }
  graph.push(`${aLabel}aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${n(total)}[aout]`);

  args.push("-filter_complex_script", filterScriptPath, "-map", "[vout]", "-map", "[aout]");
  args.push("-c:v", "libx264", "-preset", s.encoderPreset, "-pix_fmt", "yuv420p", "-profile:v", "high");
  if (s.videoBitrateKbps) {
    args.push("-b:v", `${s.videoBitrateKbps}k`, "-maxrate", `${Math.round(s.videoBitrateKbps * 1.5)}k`, "-bufsize", `${s.videoBitrateKbps * 2}k`);
  } else {
    args.push("-crf", String(s.shortSideOverride ? 28 : CRF[s.quality]));
  }
  args.push("-r", String(fps), "-g", String(fps * 2));
  args.push("-c:a", "aac", "-b:a", s.shortSideOverride ? "96k" : "192k", "-ar", "48000");
  args.push("-movflags", "+faststart", "-t", n(total), "-progress", "pipe:1", "-nostats", outputPath);

  return { args, filterGraph: graph.join(";\n"), durationSec: total, width: W, height: H, fps };
}

/** Cadeia de reenquadramento para um clipe (valores calculados, sem expressões do usuário). */
function reframeChain(
  clip: Clip,
  asset: RenderAsset,
  W: number,
  H: number,
  mode: Timeline["format"]["reframe"],
  i: number,
  graph: string[],
): string {
  const sw = asset.width;
  const sh = asset.height;
  const cover = coverCrop(sw, sh, W, H, clip.focusX ?? 0.5, clip.focusY ?? 0.5, clip.zoom);
  if (mode === "fill" || clip.zoom > 1.001) {
    return `scale=${cover.sw}:${cover.sh}:flags=bicubic,crop=${W}:${H}:${cover.x}:${cover.y},setsar=1,format=yuv420p`;
  }
  const fit = fitSize(sw, sh, W, H);
  if (mode === "fit") {
    return `scale=${fit.w}:${fit.h}:flags=bicubic,pad=${W}:${H}:${Math.floor((W - fit.w) / 2)}:${Math.floor((H - fit.h) / 2)}:color=black,setsar=1,format=yuv420p`;
  }
  // fit_blur: fundo desfocado (calculado em baixa resolução para ser rápido)
  const bw = even(W / 4);
  const bh = even(H / 4);
  const small = coverCrop(sw, sh, bw, bh, 0.5, 0.5);
  graph.push(`[v${i}pre]split=2[v${i}bgsrc][v${i}fgsrc]`);
  graph.push(
    `[v${i}bgsrc]scale=${small.sw}:${small.sh},crop=${bw}:${bh}:${small.x}:${small.y},boxblur=8:2,scale=${W}:${H},eq=brightness=-0.08[v${i}bg]`,
  );
  graph.push(`[v${i}fgsrc]scale=${fit.w}:${fit.h}:flags=bicubic[v${i}fg]`);
  graph.push(
    `[v${i}bg][v${i}fg]overlay=${Math.floor((W - fit.w) / 2)}:${Math.floor((H - fit.h) / 2)},setsar=1,format=yuv420p[v${i}fb]`,
  );
  // o rótulo de saída real é [v{i}]; usamos copy (null) para encadear
  return `null[v${i}pre];[v${i}fb]null`;
}

export function coverCrop(sw: number, sh: number, W: number, H: number, fx: number, fy: number, zoom = 1) {
  const scale = Math.max(W / sw, H / sh) * Math.max(1, zoom);
  const csw = Math.max(W, even(Math.ceil(sw * scale)));
  const csh = Math.max(H, even(Math.ceil(sh * scale)));
  const x = Math.round(Math.min(csw - W, Math.max(0, csw * fx - W / 2)));
  const y = Math.round(Math.min(csh - H, Math.max(0, csh * fy - H / 2)));
  return { sw: csw, sh: csh, x, y };
}

export function fitSize(sw: number, sh: number, W: number, H: number) {
  const scale = Math.min(W / sw, H / sh);
  return { w: Math.min(W, even(Math.floor(sw * scale))), h: Math.min(H, even(Math.floor(sh * scale))) };
}

function n(v: number): string {
  return String(round3(v));
}

function hexToFfmpeg(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "0x0B0B0C";
  return `0x${hex.slice(1).toUpperCase()}`;
}

/** Escapa um caminho para uso como valor de opção dentro do grafo de filtros. */
export function escapeFilterPath(p: string): string {
  if (!/^[\w./\- ]+$/.test(p)) throw new Error("Caminho de arquivo com caracteres não permitidos.");
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/ /g, "\\ ");
}
