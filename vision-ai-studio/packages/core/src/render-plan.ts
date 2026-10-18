import { z } from "zod";
import { FORMAT_PRESETS, Resolution, even, outputDimensions } from "./presets";
import { type Clip, type Timeline, clipDuration, clipsDuration, endCardDuration, round3 } from "./timeline";

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
  /** Arquivo .ass já gerado (ou null sem legendas). */
  assPath: string | null;
  fontsDir: string | null;
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

  tl.clips.forEach((clip, i) => {
    const asset = inputs.assets.get(clip.assetId);
    if (!asset) throw new Error(`Arquivo do clipe ${i + 1} não encontrado.`);
    if (!asset.hasVideo) throw new Error(`O arquivo do clipe ${i + 1} não contém vídeo.`);
    const start = Math.max(0, Math.min(clip.sourceStart, asset.duration));
    const dur = Math.max(0.04, Math.min(clipDuration(clip), asset.duration - start));
    args.push("-ss", n(start), "-t", n(dur), "-i", asset.path);
    const k = inputIndex++;
    const vf = `[${k}:v]setpts=PTS-STARTPTS,fps=${fps},${reframeChain(clip, asset, W, H, tl.format.reframe, i, graph)}`;
    graph.push(`${vf}[v${i}]`);
    const vol = round3(clip.volume * tl.audio.originalVolume);
    if (asset.hasAudio) {
      graph.push(
        `[${k}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${vol},apad,atrim=0:${n(dur)}[a${i}]`,
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
    args.push("-loop", "1", "-t", n(cardDur), "-i", logoPath);
    const k = inputIndex++;
    const lw = even(W * card.scale);
    graph.push(`color=c=${hexToFfmpeg(card.backgroundColor)}:s=${W}x${H}:r=${fps}:d=${n(cardDur)}[ecbg]`);
    graph.push(`[${k}:v]scale=${lw}:-2:flags=lanczos,format=rgba[eclogo]`);
    graph.push(
      `[ecbg][eclogo]overlay=(W-w)/2:(H-h)/2:shortest=1,fade=t=in:st=0:d=0.4,setsar=1,format=yuv420p[vend]`,
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
  if (inputs.assPath && tl.captions.enabled) {
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
