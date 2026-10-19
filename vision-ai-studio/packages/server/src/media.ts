import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  type AssetAnalysis,
  type MediaProbe,
  computeActivity,
  findStaticIntervals,
  invertIntervals,
  parseFfprobe,
  parseMeanVolume,
  parseSceneCuts,
  parseSilenceDetect,
} from "@vision/core";
import { ffmpeg, ffprobe } from "./ffmpeg";
import { ProcessingError } from "./errors";

export async function probeFile(filePath: string, signal?: AbortSignal): Promise<MediaProbe> {
  try {
    const { stderr, stdout } = await ffprobe(
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { captureStdout: true, signal, timeoutMs: 60_000 },
    );
    const json = JSON.parse(stdout.toString() || "{}");
    if (!json.format) throw new ProcessingError("invalid_media", "Não foi possível ler o arquivo de mídia.", false, stderr);
    return parseFfprobe(json);
  } catch (err) {
    if (err instanceof ProcessingError && err.code === "ffmpeg_failed") {
      throw new ProcessingError("invalid_media", "O arquivo parece estar corrompido ou não é um formato de mídia suportado.", false, err.detail);
    }
    throw err;
  }
}

export interface AnalyzeOptions {
  signal?: AbortSignal;
  onStage?: (stage: string, progress: number) => void;
}

const ACT_W = 64;
const ACT_H = 36;
const ACT_FPS = 2;

/**
 * Análise técnica real do arquivo:
 * 1. Silêncio + volume médio (silencedetect/volumedetect).
 * 2. Trocas de cena (score de cena do FFmpeg) e mapa de movimento (diferença de quadros).
 * Não identifica pessoas, objetos ou ações — isso exige IA multimodal.
 */
export async function analyzeFile(filePath: string, probe: MediaProbe, opts: AnalyzeOptions = {}): Promise<AssetAnalysis> {
  const duration = probe.durationSec;
  let silences: AssetAnalysis["silences"] = [];
  let meanVolumeDb: number | null = null;
  if (probe.hasAudio) {
    opts.onStage?.("Detectando silêncios", 0.1);
    const { stderr } = await ffmpeg(
      ["-hide_banner", "-nostdin", "-i", filePath, "-vn", "-sn", "-af", "silencedetect=noise=-35dB:d=0.5,volumedetect", "-f", "null", "-"],
      { signal: opts.signal },
    );
    silences = parseSilenceDetect(stderr, duration);
    meanVolumeDb = parseMeanVolume(stderr);
  }

  let sceneCuts: number[] = [];
  let activity: AssetAnalysis["activity"] = null;
  if (probe.hasVideo) {
    opts.onStage?.("Detectando cenas e movimento", 0.45);
    const { stderr, stdout } = await ffmpeg(
      [
        "-hide_banner",
        "-nostdin",
        "-i",
        filePath,
        "-an",
        "-sn",
        "-filter_complex",
        `[0:v]fps=4,scale=160:-2,split=2[sc][mv];[sc]select='gt(scene\\,0.32)',showinfo[scout];[mv]fps=${ACT_FPS},scale=${ACT_W}:${ACT_H},format=gray[mvout]`,
        "-map",
        "[scout]",
        "-f",
        "null",
        "-",
        "-map",
        "[mvout]",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { signal: opts.signal, captureStdout: true },
    );
    sceneCuts = parseSceneCuts(stderr).filter((t) => t > 0.2 && t < duration - 0.2);
    activity = computeActivity(new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.byteLength), ACT_W, ACT_H, ACT_FPS);
  }
  opts.onStage?.("Consolidando análise", 0.9);
  const soundIntervals = probe.hasAudio ? invertIntervals(silences, duration) : [];
  return {
    version: 1,
    duration,
    hasAudio: probe.hasAudio,
    silences,
    sceneCuts,
    activity,
    meanVolumeDb,
    soundIntervals,
    staticIntervals: findStaticIntervals(activity),
  };
}

export async function extractThumbnail(filePath: string, outPath: string, atSec: number, width = 640): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  await ffmpeg(
    ["-hide_banner", "-nostdin", "-y", "-ss", String(Math.max(0, atSec)), "-i", filePath, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", outPath],
    { timeoutMs: 60_000 },
  );
  const s = await stat(outPath).catch(() => null);
  if (!s || s.size === 0) throw new ProcessingError("thumbnail_failed", "Não foi possível gerar a miniatura.", false);
}

/**
 * Cópia leve para a prévia no navegador: 720p no lado menor, H.264 8 bits,
 * keyframe a cada segundo (busca rápida) e moov no início (começa a tocar sem
 * baixar o arquivo inteiro). Vídeos de celular (HEVC/4K/HDR) travam a prévia
 * em conexões comuns; o render final continua usando o original.
 */
export async function createPreviewProxy(filePath: string, outPath: string, durationSec: number, signal?: AbortSignal, onProgress?: (f: number) => void): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true });
  await ffmpeg(
    [
      "-hide_banner", "-nostdin", "-y", "-i", filePath,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
      "-vf", "scale='if(lt(iw,ih),trunc(min(720,iw)/2)*2,-2)':'if(lt(iw,ih),-2,trunc(min(720,ih)/2)*2)',format=yuv420p",
      "-fpsmax", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-force_key_frames", "expr:gte(t,n_forced*1)",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-movflags", "+faststart", outPath,
    ],
    { signal, expectedDurationSec: durationSec, onProgress, timeoutMs: Math.max(10 * 60_000, durationSec * 4000) },
  );
  const s = await stat(outPath).catch(() => null);
  if (!s || s.size === 0) throw new ProcessingError("proxy_failed", "Não foi possível gerar a cópia de prévia.", true);
}

/**
 * Lê o canto superior esquerdo da logo: transparente → a cartela usa o degradê da
 * marca; opaco → a cartela usa essa cor de fundo (evita o "quadrado" em volta da logo).
 */
export async function inspectLogo(filePath: string): Promise<{ hasAlpha: boolean; cornerColor: string | null }> {
  try {
    const { stdout } = await ffmpeg(
      ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", filePath, "-frames:v", "1", "-vf", "crop=2:2:0:0,format=rgba", "-f", "rawvideo", "-"],
      { captureStdout: true, timeoutMs: 30_000 },
    );
    const px = stdout;
    if (!px || px.length < 4) return { hasAlpha: true, cornerColor: null };
    if (px[3] < 250) return { hasAlpha: true, cornerColor: null };
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return { hasAlpha: false, cornerColor: `#${hex(px[0])}${hex(px[1])}${hex(px[2])}`.toUpperCase() };
  } catch {
    return { hasAlpha: true, cornerColor: null };
  }
}

/** Extrai quadros (JPEG pequenos) em instantes específicos — usados na análise visual por IA. */
export async function extractFrames(filePath: string, times: number[], outDir: string, width = 512, signal?: AbortSignal): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const out: string[] = [];
  for (const [i, t] of times.entries()) {
    const p = path.join(outDir, `frame_${String(i).padStart(3, "0")}.jpg`);
    await ffmpeg(
      ["-hide_banner", "-nostdin", "-y", "-ss", t.toFixed(3), "-i", filePath, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "5", p],
      { signal, timeoutMs: 60_000 },
    );
    out.push(p);
  }
  return out;
}

/** Áudio mono 16 kHz em MP3 (leve) para envio ao provedor de transcrição. */
export async function extractAudioChunks(
  filePath: string,
  outDir: string,
  durationSec: number,
  chunkSec = 600,
  format: "mp3" | "wav" = "mp3",
  signal?: AbortSignal,
): Promise<Array<{ path: string; offset: number; duration: number }>> {
  await mkdir(outDir, { recursive: true });
  const chunks: Array<{ path: string; offset: number; duration: number }> = [];
  for (let offset = 0, i = 0; offset < durationSec; offset += chunkSec, i++) {
    const d = Math.min(chunkSec, durationSec - offset);
    if (d < 0.3) break;
    const p = path.join(outDir, `audio_${i}.${format}`);
    const codec = format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "48k"] : ["-c:a", "pcm_s16le"];
    await ffmpeg(
      ["-hide_banner", "-nostdin", "-y", "-ss", String(offset), "-t", String(d), "-i", filePath, "-vn", "-ac", "1", "-ar", "16000", ...codec, p],
      { signal },
    );
    chunks.push({ path: p, offset, duration: d });
  }
  return chunks;
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Analisa o ritmo de uma música (até 10 min) para sincronizar cortes com a batida. */
export async function analyzeMusic(filePath: string, durationSec: number, signal?: AbortSignal) {
  const { detectBeats } = await import("@vision/core");
  const sr = 11025;
  const { stdout } = await ffmpeg(
    ["-hide_banner", "-nostdin", "-i", filePath, "-t", String(Math.min(600, durationSec || 600)), "-vn", "-ac", "1", "-ar", String(sr), "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1"],
    { signal, captureStdout: true },
  );
  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 2));
  const result = detectBeats(samples, sr);
  return { ...result, duration: durationSec || result.duration };
}
